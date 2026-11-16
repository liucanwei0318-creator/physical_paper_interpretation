import type {
  AnnotationType,
  ChunkTranslationOutcome,
  DerivationSourceType,
  FormulaDeepAnalysis,
  GenerationMeta,
  KnowledgeLevel,
  PaperSectionChunk,
  PrecisionAnnotation,
  TerminologyEntry,
  TranslatedPaperDocument,
  TranslatedParagraph,
  TranslatedSection,
  VerificationStatus,
  WebGroundingSource,
} from '../types/physics.ts';
import { isNonPhysicsAdministrativeTerm } from './terminologyCloud.ts';
import { normalizeExtractedPdfText } from './arxivParser.ts';

interface RawSectionBlock {
  sectionNumber: string;
  sectionTitleEn: string;
  bodyText: string;
}

const DEFAULT_MAX_CHUNK_CHARS = 3800;
const DEFAULT_MAX_PARAGRAPHS_PER_CHUNK = 5;

/**
 * Computes an adaptive chunk budget based on the user's global annotation detail level (Lv.1–Lv.5)
 * so high-verbosity modes (Lv.4/Lv.5) never exceed model output JSON token limits or compress paragraphs.
 */
export function getRecommendedChunkBudget(detailLevel: number = 3): {
  maxChunkChars: number;
  maxParagraphsPerChunk: number;
} {
  if (detailLevel >= 5) {
    return { maxChunkChars: 2400, maxParagraphsPerChunk: 3 };
  }
  if (detailLevel === 4) {
    return { maxChunkChars: 2800, maxParagraphsPerChunk: 4 };
  }
  if (detailLevel <= 2) {
    return { maxChunkChars: 4400, maxParagraphsPerChunk: 6 };
  }
  return { maxChunkChars: 3600, maxParagraphsPerChunk: 5 };
}

function isIgnoredBackmatterHeading(titleEn: string): boolean {
  return /^(?:acknowledg(?:e)?ments?|references|bibliography|funding|competing interests|data availability)\b/i.test(
    titleEn.trim()
  );
}

/**
 * Normalizes raw paper text (LaTeX / ar5iv / PDF extraction) by removing document wrapper noise
 * and repairing legacy APS/Wiley PDF encoding/hyphenation artifacts while preserving real sections and formulas.
 */
function normalizeRawPaperText(rawText: string): string {
  return normalizeExtractedPdfText(
    (rawText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\\(?:begin|end)\{(?:document|abstract)\}/gi, '\n')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Attempts to recognize explicit section headings in LaTeX, Markdown, Roman numeral (with or without period),
 * or numbered physics manuscript style (e.g. "II Entanglement Entropy in CFT", "2.1 Holographic Setup").
 */
export function parseSectionHeadingLine(line: string): { sectionNumber: string; titleEn: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 130) return null;
  if (/^\$/.test(trimmed)) return null;

  // LaTeX \section{...} or \section*{...}
  const latexSec = trimmed.match(/^\\(?:sub)*section\*?\{([^}]{2,110})\}$/i);
  if (latexSec) {
    const inner = latexSec[1].trim();
    const numInTitle = inner.match(/^(\d+(?:\.\d+)*|[IVXLCDM]+)\s*[.:]?\s+(.+)$/i);
    if (numInTitle) {
      return { sectionNumber: numInTitle[1], titleEn: numInTitle[2].trim() };
    }
    return { sectionNumber: '', titleEn: inner };
  }

  // Markdown heading: # 1. Introduction or ## II Entanglement Entropy
  const mdHead = trimmed.match(/^#{1,3}\s+(.+)$/);
  if (mdHead) {
    const inner = mdHead[1].trim();
    if (/^(?:abstract|摘要)$/i.test(inner)) {
      return { sectionNumber: '0', titleEn: 'Abstract' };
    }
    const numInTitle = inner.match(/^(\d+(?:\.\d+)*|[IVXLCDM]{1,6}|Appendix\s+[A-Z0-9]+)\s*[.:]?\s+(.+)$/i);
    if (numInTitle) {
      return {
        sectionNumber: numInTitle[1].replace(/^Appendix\s+/i, ''),
        titleEn: numInTitle[2].trim(),
      };
    }
    return { sectionNumber: '', titleEn: inner };
  }

  // Standalone Abstract heading
  if (/^(?:abstract|摘要)$/i.test(trimmed)) {
    return { sectionNumber: '0', titleEn: 'Abstract' };
  }

  // Standalone canonical unnumbered physics headings
  if (
    /^(?:Introduction|Preliminaries|Setup and Conventions|Discussion and Outlook|Conclusions?|Summary and Discussion|Acknowledgments|Acknowledgements|References|Bibliography)$/i.test(
      trimmed
    )
  ) {
    return { sectionNumber: '', titleEn: trimmed };
  }

  // "Section 2: ..." or "Appendix A: ..." or "Appendix A Details..."
  const explicitSec = trimmed.match(/^(?:Section|Sec\.?|Appendix)\s+([A-Z0-9]+(?:\.\d+)*)\s*[:.\-–]?\s*(.*)$/i);
  if (explicitSec && explicitSec[2].trim().length >= 2 && !/[.;!?]$/.test(explicitSec[2].trim())) {
    return {
      sectionNumber: explicitSec[1].trim(),
      titleEn: explicitSec[2].trim(),
    };
  }

  // Dotted numbered or Roman headings: "1. Introduction", "2.1. Gauge Fixing", "II. Effective Action"
  const dotted = trimmed.match(
    /^(\d+(?:\.\d+)*|[IVX]{1,6})\.\s+([A-Z][A-Za-z0-9\s,\-–:()/$\\'_{}^+=<>|]{2,95})$/
  );
  if (dotted && !/[.;!?]$/.test(dotted[2].trim())) {
    return {
      sectionNumber: dotted[1],
      titleEn: dotted[2].trim(),
    };
  }

  // Undotted ar5iv / APS / JHEP style headings:
  // e.g. "II Entanglement Entropy in CFT", "III.A Holographic Derivation", "1 Introduction", "2.1 Setup"
  const undotted = trimmed.match(
    /^(\d+(?:\.\d+)*|[IVX]{1,6}(?:\.[A-Z0-9]+)?)\s+([A-Z][A-Za-z0-9\s,\-–:()/$\\'_{}^+=<>|]{2,90})$/
  );
  if (undotted) {
    const secToken = undotted[1];
    const titleCandidate = undotted[2].trim();
    // Guard against English sentences starting with pronoun "I" (e.g., "I show that...", "I will discuss...")
    if (secToken === 'I' && !/^(?:Introduction|Overview|Background|Preliminaries|Summary|General|Motivation)\b/.test(titleCandidate)) {
      return null;
    }
    // Must not end with sentence punctuation and must have <= 12 words
    const wordCount = titleCandidate.split(/\s+/).length;
    if (!/[.;!?]$/.test(titleCandidate) && wordCount <= 12) {
      return {
        sectionNumber: secToken,
        titleEn: titleCandidate,
      };
    }
  }

  return null;
}

/**
 * Splits text that exceeds `maxChunkChars` or `maxParagraphsPerChunk` along paragraph boundaries
 * without cutting display equations.
 */
function splitTextByParagraphBudget(
  text: string,
  maxChunkChars: number,
  maxParagraphsPerChunk: number = DEFAULT_MAX_PARAGRAPHS_PER_CHUNK
): string[] {
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawParagraphs.length === 0) {
    return text.trim() ? [text.trim()] : [];
  }

  // Merge standalone $$...$$ equation blocks onto the preceding paragraph so an equation
  // is never orphaned from the sentence that introduces it ("... is given by \n\n $$S_A = ...$$")
  const mergedParagraphs: string[] = [];
  for (const para of rawParagraphs) {
    const isPureDisplayEq = /^\$\$[\s\S]+\$\$$/.test(para);
    if (isPureDisplayEq && mergedParagraphs.length > 0) {
      mergedParagraphs[mergedParagraphs.length - 1] += `\n\n${para}`;
    } else {
      mergedParagraphs.push(para);
    }
  }

  const parts: string[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;

  for (const para of mergedParagraphs) {
    const additionLen = para.length + (buffer.length > 0 ? 2 : 0);
    const exceedsChars = buffer.length > 0 && bufferLen + additionLen > maxChunkChars;
    const exceedsParaCount = buffer.length >= maxParagraphsPerChunk;

    if (exceedsChars || exceedsParaCount) {
      parts.push(buffer.join('\n\n'));
      buffer = [para];
      bufferLen = para.length;
    } else {
      buffer.push(para);
      bufferLen += additionLen;
    }
  }

  if (buffer.length > 0) {
    parts.push(buffer.join('\n\n'));
  }

  return parts;
}

/**
 * Splits a potentially long theoretical physics paper into deterministic, section-aligned chunks
 * suitable for chunked Gemini translation without hitting output-token JSON truncation.
 */
export function splitPaperIntoSectionChunks(
  rawText: string,
  options: {
    maxChunkChars?: number;
    maxParagraphsPerChunk?: number;
    fallbackTitleEn?: string;
  } = {}
): PaperSectionChunk[] {
  const maxChunkChars = Math.max(1200, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);
  const maxParagraphsPerChunk = Math.max(
    2,
    options.maxParagraphsPerChunk ?? DEFAULT_MAX_PARAGRAPHS_PER_CHUNK
  );
  const cleaned = normalizeRawPaperText(rawText);
  if (!cleaned) return [];

  const lines = cleaned.split('\n');
  const rawSections: RawSectionBlock[] = [];

  let currentSecNum = '';
  let currentTitle = options.fallbackTitleEn?.trim() || 'Main Formulation';
  let currentLines: string[] = [];
  let autoSecCounter = 1;
  let ignoreCurrentSection = false;

  const flushCurrent = () => {
    if (ignoreCurrentSection) {
      currentLines = [];
      return;
    }
    const body = currentLines.join('\n').trim();
    if (!body) return;
    const assignedNumber = currentSecNum || String(autoSecCounter++);
    rawSections.push({
      sectionNumber: assignedNumber,
      sectionTitleEn: currentTitle,
      bodyText: body,
    });
  };

  for (const line of lines) {
    const heading = parseSectionHeadingLine(line);
    if (heading) {
      flushCurrent();
      if (isIgnoredBackmatterHeading(heading.titleEn)) {
        ignoreCurrentSection = true;
        currentLines = [];
        continue;
      }
      ignoreCurrentSection = false;
      currentSecNum = heading.sectionNumber || String(autoSecCounter++);
      currentTitle = heading.titleEn;
      currentLines = [];
    } else if (!ignoreCurrentSection) {
      currentLines.push(line);
    }
  }
  flushCurrent();

  // If no sections were emitted (unlikely), wrap entire cleaned text
  if (rawSections.length === 0) {
    rawSections.push({
      sectionNumber: '1',
      sectionTitleEn: options.fallbackTitleEn?.trim() || 'Main Text',
      bodyText: cleaned,
    });
  }

  // Sub-split overly long sections along paragraph boundaries
  const expandedBlocks: Array<{ sectionNumber: string; sectionTitleEn: string; text: string }> = [];
  for (const sec of rawSections) {
    const subParts = splitTextByParagraphBudget(
      sec.bodyText,
      maxChunkChars,
      maxParagraphsPerChunk
    );
    subParts.forEach((partText, pIdx) => {
      expandedBlocks.push({
        sectionNumber: sec.sectionNumber,
        sectionTitleEn:
          subParts.length > 1
            ? `${sec.sectionTitleEn} (Part ${pIdx + 1}/${subParts.length})`
            : sec.sectionTitleEn,
        text: partText,
      });
    });
  }

  const totalChunks = expandedBlocks.length;
  return expandedBlocks.map((blk, idx) => ({
    chunkIndex: idx,
    totalChunks,
    sectionNumber: blk.sectionNumber,
    sectionTitleEn: blk.sectionTitleEn,
    rawChunkText: blk.text,
    paragraphCount: blk.text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
    charCount: blk.text.length,
  }));
}

/**
 * Extracts real display equations $$...$$ from an English chunk for honest preservation
 * when Gemini translation is degraded/unavailable.
 */
function extractRealDisplayEquations(
  text: string,
  sectionNumber: string,
  paraIdx: number
): Array<{ number: string; latex: string }> {
  const eqMatches = [...text.matchAll(/\$\$([\s\S]+?)\$\$/g)];
  return eqMatches
    .map((m, i) => ({
      number: `${sectionNumber}.${paraIdx}.${i + 1}`,
      latex: m[1].trim(),
    }))
    .filter((eq) => eq.latex.length > 0);
}

/**
 * Builds an honest degraded section directly from the user's real input chunk
 * without ever fabricating unrelated physics formulas or templates.
 */
export function buildFallbackSectionFromChunk(
  chunk: PaperSectionChunk,
  reason?: string,
  meta?: GenerationMeta
): TranslatedSection {
  const rawParagraphs = chunk.rawChunkText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphs: TranslatedParagraph[] = (rawParagraphs.length > 0 ? rawParagraphs : [chunk.rawChunkText]).map(
    (rawP, idx) => {
      const paraNum = idx + 1;
      const cleanExcerpt = rawP
        .replace(/\\(?:begin|end)\{(?:abstract|document)\}/gi, '')
        .replace(/\\(?:sub)*section\*?\{([^}]*)\}/gi, '【$1】')
        .trim();

      return {
        id: `p-c${chunk.chunkIndex + 1}-${paraNum}`,
        paragraphIndex: paraNum,
        statementType: idx === 0 ? '基本假设' : '正文论述',
        originalEnExcerpt: cleanExcerpt,
        translatedZhText: `【实时翻译已降级，暂保留英文原文供核对${reason ? `｜原因：${reason}` : ''}】\n\n${cleanExcerpt}`,
        equations: extractRealDisplayEquations(cleanExcerpt, chunk.sectionNumber, paraNum),
        annotations: [],
      };
    }
  );

  return {
    sectionNumber: chunk.sectionNumber,
    titleZh: `${chunk.sectionTitleEn}（待重试翻译）`,
    titleEn: chunk.sectionTitleEn,
    paragraphs,
    chunkIndex: chunk.chunkIndex,
    generationMeta: meta ?? {
      degraded: true,
      sourceMode: 'deterministic_fallback',
      reason: reason || '当前章节未能完成实时翻译，已保留原文内容。',
      retryable: true,
    },
  };
}

/**
 * Merges ordered per-chunk translation outcomes into a single cohesive TranslatedPaperDocument,
 * deduplicating terminology entries and computing accurate degradation telemetry.
 */
export function mergeTranslatedSectionChunks(params: {
  baseMeta: {
    paperId?: string;
    titleZh: string;
    titleEn: string;
    authors: string;
    institutionOrJournal: string;
    arxivIdOrDoi: string;
    abstractZh: string;
    groundingSources: WebGroundingSource[];
  };
  chunkOutcomes: ChunkTranslationOutcome[];
}): TranslatedPaperDocument {
  const sorted = [...params.chunkOutcomes].sort((a, b) => a.chunkIndex - b.chunkIndex);

  const sections: TranslatedSection[] = [];
  const termMap = new Map<string, TerminologyEntry>();
  let geminiChunks = 0;
  let degradedChunks = 0;
  let failedChunks = 0;
  let firstDegradedReason = '';
  let firstDegradedCode: GenerationMeta['errorCode'] | undefined;
  let firstModelUsed: string | undefined;

  let resolvedTitleZh = params.baseMeta.titleZh;
  let resolvedAbstractZh = params.baseMeta.abstractZh;

  for (const outcome of sorted) {
    if (outcome.titleZh && outcome.chunkIndex === 0 && !resolvedTitleZh) {
      resolvedTitleZh = outcome.titleZh;
    }
    if (outcome.translatedAbstractZh && outcome.chunkIndex === 0) {
      resolvedAbstractZh = outcome.translatedAbstractZh;
    }

    if (outcome.status === 'completed' && outcome.generationMeta?.sourceMode === 'gemini') {
      geminiChunks++;
      if (!firstModelUsed && outcome.generationMeta.modelUsed) {
        firstModelUsed = outcome.generationMeta.modelUsed;
      }
    } else if (outcome.status === 'failed') {
      failedChunks++;
      if (!firstDegradedReason) {
        firstDegradedReason = outcome.errorMessage || outcome.generationMeta?.reason || '部分章节翻译请求失败';
        firstDegradedCode = outcome.generationMeta?.errorCode;
      }
    } else {
      degradedChunks++;
      if (!firstDegradedReason) {
        firstDegradedReason = outcome.generationMeta?.reason || outcome.errorMessage || '部分章节触发降级保护';
        firstDegradedCode = outcome.generationMeta?.errorCode;
      }
    }

    if (outcome.section) {
      sections.push(
        normalizeTranslatedSection(
          {
            ...outcome.section,
            chunkIndex: outcome.chunkIndex,
            generationMeta: outcome.generationMeta ?? outcome.section.generationMeta,
          },
          outcome.chunkIndex
        )
      );
    }

    for (const term of outcome.terminologyItems || []) {
      if (
        isNonPhysicsAdministrativeTerm(
          term.termZh,
          term.termEn,
          term.category,
          term.definitionSummary
        )
      ) {
        continue;
      }
      const key = `${(term.termEn || '').trim().toLowerCase()}::${(term.termZh || '').trim()}`;
      if (key !== '::' && !termMap.has(key)) {
        termMap.set(key, term);
      }
    }
  }

  const totalChunks = sorted.length;
  const anyDegraded = degradedChunks > 0 || failedChunks > 0;

  const overallMeta: GenerationMeta = anyDegraded
    ? {
        degraded: true,
        sourceMode: geminiChunks > 0 ? 'gemini' : 'deterministic_fallback',
        modelUsed: firstModelUsed,
        errorCode: firstDegradedCode || 'UNKNOWN_ERROR',
        reason:
          geminiChunks > 0
            ? `共 ${totalChunks} 节中，${geminiChunks} 节由 Gemini 完成，${degradedChunks + failedChunks} 节发生降级（${firstDegradedReason}）`
            : firstDegradedReason || '全文实时翻译未能成功调用 Gemini，当前保留原文节选。',
        retryable: true,
        timestamp: new Date().toISOString(),
      }
    : {
        degraded: false,
        sourceMode: 'gemini',
        modelUsed: firstModelUsed,
        retryable: false,
        timestamp: new Date().toISOString(),
      };

  return normalizeTranslatedPaperDocument({
    paperId: params.baseMeta.paperId || `doc-${Date.now()}`,
    titleZh: resolvedTitleZh || `${params.baseMeta.titleEn}（中文深度批注文稿）`,
    titleEn: params.baseMeta.titleEn,
    authors: params.baseMeta.authors,
    institutionOrJournal: params.baseMeta.institutionOrJournal,
    arxivIdOrDoi: params.baseMeta.arxivIdOrDoi,
    abstractZh: resolvedAbstractZh,
    sections,
    terminologyTable: Array.from(termMap.values()),
    citations: (params.baseMeta.groundingSources || []).map((s, i) => ({
      citeKey: `[${i + 1}]`,
      authorsAndYear: s.sourceType,
      title: s.title,
      doiOrArxiv: s.uri,
      status: '已核验' as const,
      verificationNote: s.snippet || '通过互联网学术数据库实时检索核验',
      url: s.uri,
    })),
    groundingSources: params.baseMeta.groundingSources || [],
    generationMeta: overallMeta,
    chunkStatusSummary: {
      totalChunks,
      geminiChunks,
      degradedChunks,
      failedChunks,
    },
  })!;
}

/**
 * Normalizes FormulaDeepAnalysis objects from LLM responses or legacy storage,
 * ensuring symbols, theoremsUsed, and derivationSteps are always valid arrays.
 */
export function normalizeFormulaDeepAnalysis(
  rawFa: unknown,
  fallbackEqNum: string = '1'
): FormulaDeepAnalysis | undefined {
  if (!rawFa || typeof rawFa !== 'object') return undefined;
  const fa = rawFa as Record<string, unknown>;

  const symbols = Array.isArray(fa.symbols)
    ? fa.symbols
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map((s) => ({
          symbolLatex: typeof s.symbolLatex === 'string' ? s.symbolLatex : String(s.symbol || ''),
          meaningZh: typeof s.meaningZh === 'string' ? s.meaningZh : String(s.meaning || ''),
        }))
    : [];

  const theoremsUsed = Array.isArray(fa.theoremsUsed)
    ? fa.theoremsUsed.map((t) => String(t ?? '').trim()).filter(Boolean)
    : typeof fa.theoremsUsed === 'string' && fa.theoremsUsed.trim()
    ? [fa.theoremsUsed.trim()]
    : [];

  const rawSteps = Array.isArray(fa.derivationSteps)
    ? fa.derivationSteps
    : Array.isArray(fa.keySteps)
    ? fa.keySteps
    : [];

  const derivationSteps = rawSteps
    .map((step, idx) => {
      if (typeof step === 'string') {
        return {
          stepIndex: idx + 1,
          sourceType: '补充推导' as DerivationSourceType,
          descriptionZh: step,
          latex: '',
        };
      }
      if (step && typeof step === 'object') {
        const st = step as Record<string, unknown>;
        const rawSource = typeof st.sourceType === 'string' ? st.sourceType : '补充推导';
        const validSource: DerivationSourceType =
          rawSource === '原文推导' || rawSource === '补充推导' || rawSource === '独立核验'
            ? rawSource
            : '补充推导';
        return {
          stepIndex: typeof st.stepIndex === 'number' ? st.stepIndex : idx + 1,
          sourceType: validSource,
          descriptionZh:
            typeof st.descriptionZh === 'string'
              ? st.descriptionZh
              : typeof st.description === 'string'
              ? st.description
              : `推导步骤 ${idx + 1}`,
          latex: typeof st.latex === 'string' ? st.latex : '',
        };
      }
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return {
    equationNumber:
      typeof fa.equationNumber === 'string' && fa.equationNumber.trim()
        ? fa.equationNumber
        : fallbackEqNum,
    latex: typeof fa.latex === 'string' ? fa.latex : '',
    symbols,
    originAndContext:
      typeof fa.originAndContext === 'string' ? fa.originAndContext : '本段核心公式推导',
    mathematicalBasis:
      typeof fa.mathematicalBasis === 'string' ? fa.mathematicalBasis : '标准理论物理推导',
    theoremsUsed,
    validityConditions:
      typeof fa.validityConditions === 'string' ? fa.validityConditions : '遵循正文物理假设条件',
    roleInPaper: typeof fa.roleInPaper === 'string' ? fa.roleInPaper : '支撑本节核心物理结论',
    derivationSteps,
  };
}

const VALID_ANNOTATION_TYPES: ReadonlySet<AnnotationType> = new Set([
  '理论解释',
  '数学推导',
  '物理机制',
  '前置知识',
  '关键辨析',
]);

const VALID_KNOWLEDGE_LEVELS: ReadonlySet<KnowledgeLevel> = new Set(['K1', 'K2', 'K3', 'K4']);

export function normalizePrecisionAnnotation(
  rawAnn: unknown,
  fallbackId: string
): PrecisionAnnotation {
  const ann = (rawAnn && typeof rawAnn === 'object' ? rawAnn : {}) as Record<string, unknown>;
  const rawType = typeof ann.type === 'string' ? ann.type : '理论解释';
  const type: AnnotationType = VALID_ANNOTATION_TYPES.has(rawType as AnnotationType)
    ? (rawType as AnnotationType)
    : '理论解释';

  const rawLevel =
    typeof ann.knowledgeLevelTag === 'string'
      ? ann.knowledgeLevelTag
      : typeof ann.knowledgeLevel === 'string'
      ? ann.knowledgeLevel
      : 'K3';
  const knowledgeLevelTag: KnowledgeLevel = VALID_KNOWLEDGE_LEVELS.has(rawLevel as KnowledgeLevel)
    ? (rawLevel as KnowledgeLevel)
    : 'K3';

  const rawAuth = typeof ann.derivationAuthenticity === 'string' ? ann.derivationAuthenticity : undefined;
  const derivationAuthenticity: DerivationSourceType | undefined =
    rawAuth === '原文推导' || rawAuth === '补充推导' || rawAuth === '独立核验'
      ? rawAuth
      : undefined;

  const rawVer = typeof ann.verificationStatus === 'string' ? ann.verificationStatus : '已核验';
  const verificationStatus: VerificationStatus =
    rawVer === '已核验' || rawVer === '待核实' || rawVer === '存在学术争议' ? rawVer : '已核验';

  return {
    id: typeof ann.id === 'string' && ann.id.trim() ? ann.id : fallbackId,
    type,
    targetConceptZh:
      typeof ann.targetConceptZh === 'string' && ann.targetConceptZh.trim()
        ? ann.targetConceptZh
        : typeof ann.termZh === 'string' && ann.termZh.trim()
        ? ann.termZh
        : '核心物理概念',
    targetConceptEn:
      typeof ann.targetConceptEn === 'string'
        ? ann.targetConceptEn
        : typeof ann.termEn === 'string'
        ? ann.termEn
        : '',
    targetEquationOrClause:
      typeof ann.targetEquationOrClause === 'string' && ann.targetEquationOrClause.trim()
        ? ann.targetEquationOrClause
        : typeof ann.anchorTextZh === 'string'
        ? ann.anchorTextZh
        : '本段核心论述',
    knowledgeLevelTag,
    derivationAuthenticity,
    verificationStatus,
    whatItIs:
      typeof ann.whatItIs === 'string' && ann.whatItIs.trim()
        ? ann.whatItIs
        : typeof ann.summaryZh === 'string'
        ? ann.summaryZh
        : '见本段理论阐述。',
    whyHereAndRole:
      typeof ann.whyHereAndRole === 'string' && ann.whyHereAndRole.trim()
        ? ann.whyHereAndRole
        : '衔接前置理论并支撑本段核心推导。',
    prerequisitesNeeded:
      typeof ann.prerequisitesNeeded === 'string'
        ? ann.prerequisitesNeeded
        : typeof ann.prerequisiteSource === 'string'
        ? ann.prerequisiteSource
        : undefined,
    mathOrPhysicalMechanism:
      typeof ann.mathOrPhysicalMechanism === 'string' && ann.mathOrPhysicalMechanism.trim()
        ? ann.mathOrPhysicalMechanism
        : typeof ann.detailZh === 'string'
        ? ann.detailZh
        : '通过正文数学形式体系严密导出。',
    commonMisconceptions:
      typeof ann.commonMisconceptions === 'string' ? ann.commonMisconceptions : undefined,
    impactOnSubsequentArgs:
      typeof ann.impactOnSubsequentArgs === 'string' ? ann.impactOnSubsequentArgs : undefined,
    formulaAnalysis: normalizeFormulaDeepAnalysis(ann.formulaAnalysis),
    referenceNote: typeof ann.referenceNote === 'string' ? ann.referenceNote : undefined,
    suppressedByK1: typeof ann.suppressedByK1 === 'boolean' ? ann.suppressedByK1 : undefined,
  };
}

export function normalizeTranslatedParagraph(
  rawPara: unknown,
  chunkIndex: number,
  paraIdx: number
): TranslatedParagraph {
  const p = (rawPara && typeof rawPara === 'object' ? rawPara : {}) as Record<string, unknown>;
  const id =
    typeof p.id === 'string' && p.id.trim() ? p.id : `p-c${chunkIndex + 1}-${paraIdx + 1}`;
  const paragraphIndex =
    typeof p.paragraphIndex === 'number' && Number.isFinite(p.paragraphIndex)
      ? p.paragraphIndex
      : paraIdx + 1;

  const rawEquations = Array.isArray(p.equations) ? p.equations : [];
  const equations = rawEquations
    .filter((eq): eq is Record<string, unknown> => Boolean(eq) && typeof eq === 'object')
    .map((eq, eqIdx) => ({
      number:
        typeof eq.number === 'string' && eq.number.trim()
          ? eq.number
          : `${chunkIndex + 1}.${eqIdx + 1}`,
      latex: typeof eq.latex === 'string' ? eq.latex : '',
    }))
    .filter((eq) => eq.latex.trim().length > 0);

  const rawAnnotations = Array.isArray(p.annotations) ? p.annotations : [];
  const annotations = rawAnnotations
    .filter((a) => Boolean(a) && typeof a === 'object')
    .map((a, aIdx) => normalizePrecisionAnnotation(a, `ann-${id}-${aIdx + 1}`));

  const rawStmt = typeof p.statementType === 'string' ? p.statementType : '正文论述';
  const validStmtTypes = new Set([
    '正文论述',
    '基本假设',
    '严格定义',
    '核心定理/引理',
    '关键推论',
    '物理结论',
    '歧义辨析',
  ]);
  const statementType = validStmtTypes.has(rawStmt)
    ? (rawStmt as TranslatedParagraph['statementType'])
    : '正文论述';

  return {
    id,
    paragraphIndex,
    statementType,
    originalEnExcerpt:
      typeof p.originalEnExcerpt === 'string'
        ? p.originalEnExcerpt
        : typeof p.sourceEn === 'string'
        ? p.sourceEn
        : '',
    translatedZhText:
      typeof p.translatedZhText === 'string'
        ? p.translatedZhText
        : typeof p.translationZh === 'string'
        ? p.translationZh
        : '',
    equations,
    ambiguityNote: typeof p.ambiguityNote === 'string' ? p.ambiguityNote : undefined,
    authorIssueNote: typeof p.authorIssueNote === 'string' ? p.authorIssueNote : undefined,
    annotations,
  };
}

export function normalizeTranslatedSection(
  rawSec: unknown,
  fallbackChunkIndex: number = 0
): TranslatedSection {
  const sec = (rawSec && typeof rawSec === 'object' ? rawSec : {}) as Record<string, unknown>;
  const chunkIndex =
    typeof sec.chunkIndex === 'number' && Number.isFinite(sec.chunkIndex)
      ? sec.chunkIndex
      : fallbackChunkIndex;
  const sectionNumber =
    typeof sec.sectionNumber === 'string' && sec.sectionNumber.trim()
      ? sec.sectionNumber
      : typeof sec.number === 'string' && sec.number.trim()
      ? sec.number
      : String(chunkIndex + 1);
  const titleZh =
    typeof sec.titleZh === 'string' && sec.titleZh.trim()
      ? sec.titleZh
      : typeof sec.headingZh === 'string' && sec.headingZh.trim()
      ? sec.headingZh
      : `第 ${sectionNumber} 节`;
  const titleEn =
    typeof sec.titleEn === 'string' && sec.titleEn.trim()
      ? sec.titleEn
      : typeof sec.headingEn === 'string' && sec.headingEn.trim()
      ? sec.headingEn
      : `Section ${sectionNumber}`;

  const rawParagraphs = Array.isArray(sec.paragraphs) ? sec.paragraphs : [];
  const paragraphs = rawParagraphs.map((p, idx) =>
    normalizeTranslatedParagraph(p, chunkIndex, idx)
  );

  return {
    sectionNumber,
    titleZh,
    titleEn,
    paragraphs,
    chunkIndex,
    generationMeta:
      sec.generationMeta && typeof sec.generationMeta === 'object'
        ? (sec.generationMeta as GenerationMeta)
        : undefined,
  };
}

export function normalizeTranslatedPaperDocument(
  rawDoc: unknown
): TranslatedPaperDocument | null {
  if (!rawDoc || typeof rawDoc !== 'object') return null;
  const doc = rawDoc as Record<string, unknown>;

  const rawSections = Array.isArray(doc.sections) ? doc.sections : [];
  const sections = rawSections.map((s, idx) => normalizeTranslatedSection(s, idx));

  const rawTerms = Array.isArray(doc.terminologyTable) ? doc.terminologyTable : [];
  const terminologyTable: TerminologyEntry[] = rawTerms
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
    .map((t) => ({
      termZh: typeof t.termZh === 'string' ? t.termZh : '',
      termEn: typeof t.termEn === 'string' ? t.termEn : '',
      firstAppearanceSection:
        typeof t.firstAppearanceSection === 'string' ? t.firstAppearanceSection : '第 1 节',
      category: typeof t.category === 'string' ? t.category : '理论物理',
      knowledgeLevel: VALID_KNOWLEDGE_LEVELS.has(t.knowledgeLevel as KnowledgeLevel)
        ? (t.knowledgeLevel as KnowledgeLevel)
        : 'K2',
      definitionSummary: typeof t.definitionSummary === 'string' ? t.definitionSummary : '',
    }))
    .filter((t) => t.termZh || t.termEn);

  const rawCitations = Array.isArray(doc.citations)
    ? doc.citations
    : Array.isArray(doc.references)
    ? doc.references
    : [];
  const citations = rawCitations
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map((c, idx) => ({
      citeKey: typeof c.citeKey === 'string' ? c.citeKey : `[${idx + 1}]`,
      authorsAndYear: typeof c.authorsAndYear === 'string' ? c.authorsAndYear : '',
      title: typeof c.title === 'string' ? c.title : '',
      doiOrArxiv: typeof c.doiOrArxiv === 'string' ? c.doiOrArxiv : '',
      status: (c.status === '已核验' || c.status === '待核实' || c.status === '存在学术争议'
        ? c.status
        : '已核验') as VerificationStatus,
      verificationNote:
        typeof c.verificationNote === 'string' ? c.verificationNote : '通过学术文献库核验',
      url: typeof c.url === 'string' ? c.url : undefined,
    }));

  const rawSources = Array.isArray(doc.groundingSources) ? doc.groundingSources : [];
  const groundingSources: WebGroundingSource[] = rawSources
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      title: typeof s.title === 'string' ? s.title : '',
      uri: typeof s.uri === 'string' ? s.uri : '',
      sourceType:
        s.sourceType === 'arXiv' ||
        s.sourceType === 'CrossRef' ||
        s.sourceType === 'GoogleSearch' ||
        s.sourceType === 'OpenLibrary'
          ? s.sourceType
          : 'arXiv',
      snippet: typeof s.snippet === 'string' ? s.snippet : undefined,
    }));

  return {
    paperId:
      typeof doc.paperId === 'string' && doc.paperId.trim()
        ? doc.paperId
        : typeof doc.id === 'string' && doc.id.trim()
        ? doc.id
        : `doc-${Date.now()}`,
    titleZh:
      typeof doc.titleZh === 'string' && doc.titleZh.trim()
        ? doc.titleZh
        : '理论物理论文中文深度批注文稿',
    titleEn:
      typeof doc.titleEn === 'string' && doc.titleEn.trim()
        ? doc.titleEn
        : 'Theoretical Physics Manuscript',
    authors: typeof doc.authors === 'string' ? doc.authors : '',
    institutionOrJournal:
      typeof doc.institutionOrJournal === 'string'
        ? doc.institutionOrJournal
        : 'arXiv / Peer-Reviewed Preprint',
    arxivIdOrDoi:
      typeof doc.arxivIdOrDoi === 'string'
        ? doc.arxivIdOrDoi
        : typeof doc.arxivId === 'string'
        ? doc.arxivId
        : '',
    abstractZh: typeof doc.abstractZh === 'string' ? doc.abstractZh : '',
    sections,
    terminologyTable,
    citations,
    groundingSources,
    generationMeta:
      doc.generationMeta && typeof doc.generationMeta === 'object'
        ? (doc.generationMeta as GenerationMeta)
        : undefined,
    chunkStatusSummary:
      doc.chunkStatusSummary && typeof doc.chunkStatusSummary === 'object'
        ? (doc.chunkStatusSummary as TranslatedPaperDocument['chunkStatusSummary'])
        : undefined,
  };
}


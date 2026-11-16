import type {
  ChunkTranslationOutcome,
  GenerationMeta,
  PaperSectionChunk,
  TerminologyEntry,
  TranslatedPaperDocument,
  TranslatedParagraph,
  TranslatedSection,
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
      sections.push({
        ...outcome.section,
        chunkIndex: outcome.chunkIndex,
        generationMeta: outcome.generationMeta ?? outcome.section.generationMeta,
        paragraphs: (outcome.section.paragraphs || []).map((p, idx) => ({
          ...p,
          id: p.id || `p-c${outcome.chunkIndex + 1}-${idx + 1}`,
          paragraphIndex: p.paragraphIndex || idx + 1,
        })),
      });
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

  return {
    paperId: params.baseMeta.paperId || `doc-${Date.now()}`,
    titleZh: resolvedTitleZh || `${params.baseMeta.titleEn}（中文深度批注文稿）`,
    titleEn: params.baseMeta.titleEn,
    authors: params.baseMeta.authors,
    institutionOrJournal: params.baseMeta.institutionOrJournal,
    arxivIdOrDoi: params.baseMeta.arxivIdOrDoi,
    abstractZh: resolvedAbstractZh,
    sections,
    terminologyTable: Array.from(termMap.values()),
    citations: params.baseMeta.groundingSources.map((s, i) => ({
      citeKey: `[${i + 1}]`,
      authorsAndYear: s.sourceType,
      title: s.title,
      doiOrArxiv: s.uri,
      status: '已核验' as const,
      verificationNote: s.snippet || '通过互联网学术数据库实时检索核验',
      url: s.uri,
    })),
    groundingSources: params.baseMeta.groundingSources,
    generationMeta: overallMeta,
    chunkStatusSummary: {
      totalChunks,
      geminiChunks,
      degradedChunks,
      failedChunks,
    },
  };
}

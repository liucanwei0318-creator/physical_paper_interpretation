import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { extractText } from 'unpdf';
import {
  analyzeMaterialScopeDeterministically,
  matchTextbookCatalog,
  parseCustomTocLines,
  type TextbookCatalogChapter,
} from './src/utils/scopeParser.ts';
import {
  parseArxivAtomXml,
  extractStructuredTextFromAr5ivHtml,
  extractDoiFromQuery,
  normalizeExtractedPdfText,
  type ArxivRelatedPaper,
} from './src/utils/arxivParser.ts';
import {
  buildDeterministicDerivationMindMap,
  normalizeDerivationMindMapTree,
} from './src/utils/derivationMindMap.ts';
import {
  buildGeminiAnnotationDetailDirective,
  getAnnotationDetailProfile,
  normalizeAnnotationDetailLevel,
} from './src/utils/annotationSettings.ts';
import {
  SUPPORTED_GEMINI_TEXT_MODELS,
  classifyGeminiError,
  cleanAndParseJson,
  buildDegradedMeta,
  buildSuccessMeta,
} from './src/utils/geminiDiagnostics.ts';
import {
  splitPaperIntoSectionChunks,
  buildFallbackSectionFromChunk,
} from './src/utils/paperChunker.ts';
import { isNonPhysicsAdministrativeTerm } from './src/utils/terminologyCloud.ts';
import type {
  GenerationMeta,
  PaperSectionChunk,
  TranslatedSection,
  TerminologyEntry,
} from './src/types/physics.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface CascadeGenerationResult {
  text: string | null;
  meta: GenerationMeta;
}

// Tracks temporary cooldown timestamps (ms) for primary models that timed out or returned unavailable errors
// so multi-chunk translations route directly to the responsive model without cold-wait stalls.
const modelCooldownUntil = new Map<string, number>();
const MODEL_COOLDOWN_MS = 600_000;

/**
 * Runs supported @google/genai text models in cascade and returns structured diagnostic metadata
 * instead of silently swallowing errors into null.
 */
async function generateWithCascadeDetailed(
  promptOrContents:
    | string
    | Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  options: {
    jsonMode?: boolean;
    pdfBase64?: string;
    systemInstruction?: string;
    timeoutMs?: number;
  } = {}
): Promise<CascadeGenerationResult> {
  const ai = getGenAIClient();
  if (!ai) {
    return {
      text: null,
      meta: buildDegradedMeta(
        'MISSING_KEY',
        '服务端未配置有效的 GEMINI_API_KEY，当前已降级为本地结构化响应。',
        false
      ),
    };
  }

  let lastClassified = classifyGeminiError(new Error('No Gemini response returned'));
  const timeoutMs = options.timeoutMs ?? 45000;
  const now = Date.now();

  // Order models so healthy (non-cooled-down) models are tried first
  const orderedModels = [...SUPPORTED_GEMINI_TEXT_MODELS].sort((a, b) => {
    const aCooling = (modelCooldownUntil.get(a) ?? 0) > now ? 1 : 0;
    const bCooling = (modelCooldownUntil.get(b) ?? 0) > now ? 1 : 0;
    return aCooling - bCooling;
  });

  for (let idx = 0; idx < orderedModels.length; idx++) {
    const modelName = orderedModels[idx];
    // Skip a cooled-down model if another model has already been tried or is available
    if ((modelCooldownUntil.get(modelName) ?? 0) > Date.now() && orderedModels.length > 1) {
      continue;
    }

    // Give experimental primary model a fast 6s probe cap so it never stalls 45s; give flash-lite the full timeoutMs
    const perModelTimeoutMs =
      modelName === 'gemini-4-hydrogen' ? Math.min(6000, timeoutMs) : timeoutMs;
    const maxAttempts = modelName === 'gemini-3.1-flash-lite' ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const contents = options.pdfBase64
          ? [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: options.pdfBase64,
                },
              },
              { text: typeof promptOrContents === 'string' ? promptOrContents : '' },
            ]
          : promptOrContents;

        const config: Record<string, unknown> = {};
        if (options.jsonMode) {
          config.responseMimeType = 'application/json';
        }
        if (options.systemInstruction) {
          config.systemInstruction = options.systemInstruction;
        }

        const response = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents,
            config: Object.keys(config).length > 0 ? config : undefined,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`TimeoutError: ${perModelTimeoutMs}ms exceeded`)),
              perModelTimeoutMs
            )
          ),
        ]);

        if (response.text && response.text.trim()) {
          modelCooldownUntil.delete(modelName);
          return {
            text: response.text.trim(),
            meta: buildSuccessMeta(modelName),
          };
        }
        if (modelName === 'gemini-4-hydrogen') {
          modelCooldownUntil.set(modelName, Date.now() + MODEL_COOLDOWN_MS);
        }
      } catch (err) {
        lastClassified = classifyGeminiError(err);
        if (!lastClassified.retryable) {
          return {
            text: null,
            meta: buildDegradedMeta(
              lastClassified.errorCode,
              lastClassified.reasonZh,
              false
            ),
          };
        }
        if (modelName === 'gemini-4-hydrogen') {
          modelCooldownUntil.set(modelName, Date.now() + MODEL_COOLDOWN_MS);
          break;
        }
        if (attempt < maxAttempts && lastClassified.errorCode === 'RATE_LIMIT_429') {
          await new Promise((r) => setTimeout(r, 1600 * attempt));
          continue;
        }
      }
    }
  }

  return {
    text: null,
    meta: buildDegradedMeta(
      lastClassified.errorCode,
      lastClassified.reasonZh,
      lastClassified.retryable
    ),
  };
}

interface GroundingSource {
  title: string;
  uri: string;
  sourceType: 'arXiv' | 'CrossRef' | 'OpenLibrary' | 'GoogleSearch';
  snippet?: string;
}

/**
 * Queries the official arXiv API for theoretical physics papers or authors/topics.
 */
async function searchArxivApi(query: string, maxResults: number = 5): Promise<GroundingSource[]> {
  try {
    const cleanArxivIdMatch = query.match(/(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i);
    const url = cleanArxivIdMatch
      ? `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanArxivIdMatch[1])}`
      : `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) return [];
    const xml = await resp.text();

    const entries = xml.split('<entry>').slice(1);
    const results: GroundingSource[] = [];

    for (const entry of entries) {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const authorMatches = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim());

      if (titleMatch && idMatch) {
        const cleanTitle = titleMatch[1].replace(/\s+/g, ' ').trim();
        const cleanUri = idMatch[1].trim().replace('http://', 'https://');
        const cleanSummary = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';
        results.push({
          title: `${cleanTitle}${authorMatches.length ? ` (${authorMatches.slice(0, 4).join(', ')})` : ''}`,
          uri: cleanUri,
          sourceType: 'arXiv',
          snippet: cleanSummary,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Attempts to fetch the full HTML/text of an arXiv paper via ar5iv / arxiv HTML endpoints
 * so the user can import a real paper's sections & equations directly by arXiv ID.
 */
async function fetchArxivFullTextById(arxivId: string): Promise<{
  title: string;
  authors: string;
  abstractText: string;
  fullTextSections: string;
  uri: string;
  sources: GroundingSource[];
  extractionWarning?: string;
} | null> {
  const cleanIdMatch = arxivId.match(/(?:arxiv:|abs\/|pdf\/|html\/)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i);
  const normalizedId = cleanIdMatch ? cleanIdMatch[1] : arxivId.trim();

  const metaSources = await searchArxivApi(normalizedId, 1);
  let title = '';
  let authors = '';
  let abstractText = '';
  let uri = `https://arxiv.org/abs/${normalizedId}`;

  if (metaSources.length > 0) {
    const top = metaSources[0];
    const parenIdx = top.title.lastIndexOf(' (');
    title = parenIdx > 0 ? top.title.slice(0, parenIdx) : top.title;
    authors = parenIdx > 0 ? top.title.slice(parenIdx + 2, -1) : '';
    abstractText = top.snippet || '';
    uri = top.uri;
  }

  let extractedBody = '';
  let extractionWarning = '';
  try {
    const ar5ivUrl = `https://ar5iv.labs.arxiv.org/html/${normalizedId}`;
    const htmlResp = await fetch(ar5ivUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PhysicaAnnotate/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (htmlResp.ok) {
      const html = await htmlResp.text();
      extractedBody = extractStructuredTextFromAr5ivHtml(html, abstractText);
    }
  } catch {
    // ar5iv unreachable or timed out
  }

  if (!extractedBody && abstractText) {
    const aiRes = await generateWithCascadeDetailed(
      `Retrieve and reconstruct the key sections, mathematical equations (in standard LaTeX), definitions, and core derivations of the theoretical physics paper "${title || normalizedId}" (${uri}). Abstract context: ${abstractText}. Output the detailed English academic text with original section headings and LaTeX equations.`
    );
    if (aiRes.text && aiRes.text.length > 100) {
      extractedBody = aiRes.text;
    } else {
      extractionWarning = `ar5iv 全文页面暂未成功提取，且 Gemini 补全失败（${aiRes.meta.reason || '服务不可用'}），当前仅导入了官方摘要。建议直接上传该论文 PDF 或重试拉取。`;
    }
  }

  if (!title && !abstractText && !extractedBody) {
    return null;
  }

  const fullTextSections = extractedBody
    ? `Abstract\n${abstractText}\n\n${extractedBody}`
    : `1. Abstract and Core Formulation\n${abstractText}`;

  return {
    title: title || `arXiv:${normalizedId}`,
    authors: authors || 'arXiv Authors',
    abstractText,
    fullTextSections,
    uri,
    sources: metaSources,
    extractionWarning: extractionWarning || undefined,
  };
}

/**
 * Queries CrossRef API for academic books, textbooks, and DOIs.
 * When the query contains an explicit DOI (e.g. 10.1002/cplx.20171), resolves the exact
 * work via /works/{doi} first before falling back to fuzzy search.
 */
async function searchCrossRefApi(query: string, rows: number = 4): Promise<GroundingSource[]> {
  const formatCrossRefItem = (it: {
    title?: string[];
    DOI?: string;
    publisher?: string;
    'container-title'?: string[];
    author?: Array<{ given?: string; family?: string }>;
    issued?: { 'date-parts'?: number[][] };
  }): GroundingSource | null => {
    if (!it.title || it.title.length === 0 || !it.DOI) return null;
    const authors = (it.author || [])
      .slice(0, 4)
      .map((a) => `${a.given || ''} ${a.family || ''}`.trim())
      .filter(Boolean)
      .join(', ');
    const year = it.issued?.['date-parts']?.[0]?.[0] || '';
    const journal = it['container-title']?.[0] || '';
    return {
      title: `${it.title[0]}${authors ? ` — ${authors}` : ''}${year ? ` (${year})` : ''}`,
      uri: `https://doi.org/${it.DOI}`,
      sourceType: 'CrossRef' as const,
      snippet: [
        `DOI: ${it.DOI}`,
        journal ? `Journal: ${journal}` : '',
        it.publisher ? `Publisher: ${it.publisher}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    };
  };

  const results: GroundingSource[] = [];
  const exactDoi = extractDoiFromQuery(query);

  if (exactDoi) {
    try {
      const exactUrl = `https://api.crossref.org/works/${encodeURIComponent(exactDoi)}`;
      const exactResp = await fetch(exactUrl, {
        headers: { 'User-Agent': 'PhysicaAnnotate/1.0 (mailto:research@example.org)' },
        signal: AbortSignal.timeout(7000),
      });
      if (exactResp.ok) {
        const exactData = (await exactResp.json()) as {
          message?: {
            title?: string[];
            DOI?: string;
            publisher?: string;
            'container-title'?: string[];
            author?: Array<{ given?: string; family?: string }>;
            issued?: { 'date-parts'?: number[][] };
          };
        };
        if (exactData.message) {
          const formatted = formatCrossRefItem(exactData.message);
          if (formatted) {
            results.push(formatted);
            if (rows <= 1 || query.trim().length <= exactDoi.length + 16) {
              return results;
            }
          }
        }
      }
    } catch {
      // Fall through to query search if exact lookup fails
    }
  }

  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${rows}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'PhysicaAnnotate/1.0 (mailto:research@example.org)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) return results;
    const data = (await resp.json()) as {
      message?: {
        items?: Array<{
          title?: string[];
          DOI?: string;
          publisher?: string;
          'container-title'?: string[];
          author?: Array<{ given?: string; family?: string }>;
          issued?: { 'date-parts'?: number[][] };
        }>;
      };
    };

    const existingUris = new Set(results.map((r) => r.uri.toLowerCase()));
    const items = data.message?.items || [];
    for (const it of items) {
      const formatted = formatCrossRefItem(it);
      if (formatted && !existingUris.has(formatted.uri.toLowerCase())) {
        results.push(formatted);
        existingUris.add(formatted.uri.toLowerCase());
      }
      if (results.length >= rows) break;
    }
    return results;
  } catch {
    return results;
  }
}

/**
 * Queries OpenLibrary API for physics textbooks, editions, and extracts any available Table of Contents chapters.
 */
async function searchOpenLibraryWithToc(
  query: string,
  limit: number = 3
): Promise<{ sources: GroundingSource[]; tocTitles: string[] }> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!resp.ok) return { sources: [], tocTitles: [] };
    const data = (await resp.json()) as {
      docs?: Array<{
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        key?: string;
        edition_key?: string[];
        subject?: string[];
      }>;
    };
    const docs = data.docs || [];
    const sources: GroundingSource[] = docs
      .filter((d) => d.title && d.key)
      .map((d) => ({
        title: `${d.title}${d.author_name ? ` — ${d.author_name.slice(0, 2).join(', ')}` : ''}${
          d.first_publish_year ? ` (${d.first_publish_year})` : ''
        }`,
        uri: `https://openlibrary.org${d.key}`,
        sourceType: 'OpenLibrary' as const,
        snippet: d.subject ? `Subjects: ${d.subject.slice(0, 5).join(', ')}` : 'OpenLibrary Catalog Record',
      }));

    // Try fetching TOC from the first edition key if available
    const tocTitles: string[] = [];
    const firstEditionKey = docs[0]?.edition_key?.[0];
    if (firstEditionKey) {
      try {
        const edResp = await fetch(
          `https://openlibrary.org/api/books?bibkeys=OLID:${firstEditionKey}&format=json&jscmd=data`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (edResp.ok) {
          const edData = (await edResp.json()) as Record<
            string,
            { table_of_contents?: Array<{ title?: string }> }
          >;
          const toc = edData[`OLID:${firstEditionKey}`]?.table_of_contents || [];
          for (const item of toc) {
            if (item.title && item.title.trim().length > 2) {
              tocTitles.push(item.title.trim());
            }
          }
        }
      } catch {
        // Ignore edition TOC fetch failure
      }
    }

    return { sources, tocTitles };
  } catch {
    return { sources: [], tocTitles: [] };
  }
}

function cleanJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return trimmed;
}

/**
 * Scrapes real web snippets & Wikipedia extracts for a book's Table of Contents (目录 / Chapters).
 */
async function scrapeWebBookTocContext(title: string, authors: string = ''): Promise<{
  snippets: string[];
  extractedTocLines: string[];
}> {
  const snippets: string[] = [];
  const extractedTocLines: string[] = [];
  const q = `${title} ${authors}`.trim();

  // 1. DuckDuckGo HTML search for "<book> 目录 Table of Contents Chapters"
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${q} 目录 Chapters Table of Contents`)}`;
    const resp = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PhysicaAnnotate/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (resp.ok) {
      const html = await resp.text();
      const snippetMatches = [
        ...html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi),
      ];
      for (const m of snippetMatches.slice(0, 6)) {
        const clean = m[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean.length > 15) {
          snippets.push(clean);
          // Check if snippet contains explicit chapter patterns like 第1章... 第2章... or Chapter 1...
          const chMatches = [
            ...clean.matchAll(/(?:第\s*[一二三四五六七八九十\d]+\s*章|Chapter\s+\d+)[^；;。，,\n]{2,35}/gi),
          ];
          for (const cm of chMatches) {
            extractedTocLines.push(cm[0].trim());
          }
        }
      }
    }
  } catch {
    // Ignore DuckDuckGo timeout
  }

  // 2. Chinese & English Wikipedia search for book overview
  try {
    const wikiUrls = [
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json`,
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json`,
    ];
    const wikiResps = await Promise.allSettled(
      wikiUrls.map((u) => fetch(u, { signal: AbortSignal.timeout(5000) }))
    );
    for (const r of wikiResps) {
      if (r.status === 'fulfilled' && r.value.ok) {
        const data = (await r.value.json()) as {
          query?: { search?: Array<{ title?: string; snippet?: string }> };
        };
        for (const item of (data.query?.search || []).slice(0, 2)) {
          if (item.snippet) {
            const clean = item.snippet.replace(/<[^>]+>/g, '').trim();
            snippets.push(`[Wikipedia: ${item.title}] ${clean}`);
          }
        }
      }
    }
  } catch {
    // Ignore Wikipedia timeout
  }

  return {
    snippets,
    extractedTocLines: Array.from(new Set(extractedTocLines)),
  };
}

/**
 * Retrieves the authentic chapter-by-chapter Table of Contents for ANY textbook or monograph:
 * 1. User-supplied customTocText (if provided)
 * 2. Exact match in our 30+ authentic textbook catalog
 * 3. Live Gemini extraction grounded by OpenLibrary TOC + DuckDuckGo + Wikipedia web context
 * 4. OpenLibrary / DuckDuckGo extracted TOC lines
 */
async function retrieveRealBookChapters(params: {
  title: string;
  authors?: string;
  editionOrYear?: string;
  openLibTocTitles?: string[];
  customTocText?: string;
}): Promise<{
  chapters: TextbookCatalogChapter[];
  domain?: string;
  resolvedAuthors?: string;
  resolvedEdition?: string;
  tocSourceLabel: string;
}> {
  const {
    title,
    authors = '',
    editionOrYear = '',
    openLibTocTitles = [],
    customTocText = '',
  } = params;

  if (customTocText.trim()) {
    return {
      chapters: parseCustomTocLines(customTocText),
      tocSourceLabel: '用户自定义/粘贴章节目录',
    };
  }

  const catalogMatch = matchTextbookCatalog(title, authors);
  if (catalogMatch) {
    return {
      chapters: catalogMatch.chapters,
      domain: catalogMatch.domain,
      resolvedAuthors: catalogMatch.canonicalAuthors,
      resolvedEdition: catalogMatch.defaultEdition,
      tocSourceLabel: `已匹配《${catalogMatch.canonicalTitle}》标准完整章节目录（共 ${catalogMatch.chapters.length} 章）`,
    };
  }

  const webContext = await scrapeWebBookTocContext(title, authors);
  const combinedTocHints = [...openLibTocTitles, ...webContext.extractedTocLines];

  const prompt = `你是一名专业的理论物理与数学物理文献专家。用户正在录入以下书籍或讲义：
- 书名：《${title}》
- 作者：${authors || '请根据书名识别'}
- 版本/年份：${editionOrYear || '标准版'}
- 互联网检索到的目录线索与摘要：
${combinedTocHints.length > 0 ? combinedTocHints.join('\n') : '无直接章节列表，请调用你对该真实教材/专著的目录记忆'}
${webContext.snippets.join('\n')}

请严格返回**该书真实的章节目录结构**（该书实际有多少章就输出多少章，严禁套用任何通用12章模板！如果是知名教材，必须输出其真实的每一章标题；如果是专题讲义或论文，输出其真实的核心章节/小节结构）：
返回严格 JSON 格式：
{
  "domain": "所属物理子领域",
  "authors": "该书真实作者",
  "editionOrYear": "出版年份与出版社",
  "chapters": [
    {
      "chapterNumber": 1,
      "titleZh": "该书第 1 章的真实中文标题",
      "titleEn": "Real English Title of Chapter 1",
      "coreConcepts": ["本章真实包含的核心物理概念1", "核心概念2", "核心概念3"],
      "mathTools": ["本章使用的数学工具"],
      "keyFormulasLatex": ["本章最具代表性的1个公式LaTeX（不含$$）"]
    }
  ]
}`;

  const aiRes = await generateWithCascadeDetailed(prompt, { jsonMode: true });
  if (aiRes.text) {
    const jsonResult = cleanAndParseJson<{
      domain?: unknown;
      authors?: unknown;
      editionOrYear?: unknown;
      chapters?: Array<Record<string, unknown>>;
    }>(aiRes.text);
    const chaptersList = jsonResult.ok ? jsonResult.data.chapters : undefined;
    if (jsonResult.ok && Array.isArray(chaptersList) && chaptersList.length > 0) {
      const parsed = jsonResult.data;
      const chapters: TextbookCatalogChapter[] = chaptersList.map(
        (c: Record<string, unknown>, idx: number) => {
          const num = typeof c.chapterNumber === 'number' ? c.chapterNumber : idx + 1;
          const tZh = String(c.titleZh || `第 ${num} 章`);
          const tEn = String(c.titleEn || tZh);
          const concepts = Array.isArray(c.coreConcepts)
            ? c.coreConcepts.map(String)
            : [tZh];
          const tools = Array.isArray(c.mathTools) ? c.mathTools.map(String) : [];
          const formulas = Array.isArray(c.keyFormulasLatex)
            ? c.keyFormulasLatex.map(String)
            : [];
          return {
            chapterNumber: num,
            titleZh: tZh,
            titleEn: tEn,
            coreConcepts: concepts,
            mathTools: tools,
            keyFormulasLatex: formulas,
            keywords: [tZh.toLowerCase(), tEn.toLowerCase(), ...concepts.map((s) => s.toLowerCase())],
          };
        }
      );
      return {
        chapters,
        domain: typeof parsed.domain === 'string' ? parsed.domain : undefined,
        resolvedAuthors: typeof parsed.authors === 'string' ? parsed.authors : undefined,
        resolvedEdition:
          typeof parsed.editionOrYear === 'string' ? parsed.editionOrYear : undefined,
        tocSourceLabel: `已通过互联网与学术文献库提取《${title}》真实目录（共 ${chapters.length} 章）`,
      };
    }
  }

  if (combinedTocHints.length >= 2) {
    const parsedFromWeb = parseCustomTocLines(combinedTocHints.join('\n'));
    return {
      chapters: parsedFromWeb,
      tocSourceLabel: `已从 OpenLibrary / 网页检索提取《${title}》章节目录（共 ${parsedFromWeb.length} 章）`,
    };
  }

  return {
    chapters: [],
    tocSourceLabel: '未在公开目录库检索到现成章节列表，您可以直接按范围录入或点击「手动粘贴/编辑本书目录」补充章节标题',
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(getGenAIClient()),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
    });
  });

  // 1. Live Internet Retrieval & Academic Verification Endpoint
  app.post('/api/web-search', async (req, res) => {
    try {
      const { query, searchMode } = req.body as {
        query?: string;
        searchMode?: 'textbook' | 'paper' | 'concept';
      };

      if (!query || !query.trim()) {
        res.status(400).json({ error: '请输入需要检索核验的教材名称、arXiv 编号、DOI 或理论物理概念。' });
        return;
      }

      const detectedDoi = extractDoiFromQuery(query);
      const isPaperOrDoiQuery = searchMode === 'paper' || Boolean(detectedDoi);

      const [arxivResults, crossrefResults, openLibData] = await Promise.all([
        detectedDoi ? Promise.resolve([] as GroundingSource[]) : searchArxivApi(query, 4),
        searchCrossRefApi(query, 4),
        isPaperOrDoiQuery
          ? Promise.resolve({ sources: [] as GroundingSource[], tocTitles: [] as string[] })
          : searchOpenLibraryWithToc(query, 3),
      ]);

      const combinedSources: GroundingSource[] = detectedDoi
        ? [...crossrefResults, ...arxivResults]
        : [...arxivResults, ...crossrefResults, ...openLibData.sources];

      const sourcesContext = combinedSources
        .slice(0, 6)
        .map((s, idx) => `${idx + 1}. ${s.title} (${s.sourceType}: ${s.snippet || s.uri})`)
        .join('\n');

      const prompt = `你是一名专业的理论物理研究者与文献核验专家。用户正在检索核验以下内容：「${query}」（检索模式：${searchMode || '综合核验'}）。
互联网学术数据库实时检索到的文献记录：
${sourcesContext || '未直接命中外部条目，请基于理论物理权威文献库回答'}

请核实并说明该教材/论文/概念的：
1. 准确名称、作者、版本/发表年份、arXiv 编号或 DOI；
2. 涉及的核心理论物理模块、详细章节目录结构与数学工具；
3. 若为教材，指出不同章节的难度梯度，并提醒“读过书名不代表掌握全书”的关键分水岭章节；若为论文，指出其核心前置知识要求。
请用严谨、精炼的中文学术语言回答。`;

      const aiRes = await generateWithCascadeDetailed(prompt);
      let aiSynthesis = aiRes.text;

      if (!aiSynthesis) {
        if (combinedSources.length > 0) {
          aiSynthesis =
            `已通过实时互联网学术数据库（arXiv、CrossRef、OpenLibrary）检索到与「${query}」匹配的 ${combinedSources.length} 条权威记录：\n` +
            combinedSources
              .slice(0, 5)
              .map((s, idx) => `${idx + 1}. **${s.title}** [${s.sourceType}] — ${s.snippet || s.uri}`)
              .join('\n') +
            `\n\n（注：AI 综述合成暂不可用：${aiRes.meta.reason || '请求失败'}）`;
        } else {
          aiSynthesis = `已完成互联网数据库检索，但暂未命中「${query}」的独立记录，且 AI 综述合成失败（${aiRes.meta.reason || '请稍后重试'}）。`;
        }
      }

      res.json({
        query,
        synthesis: aiSynthesis,
        sources: combinedSources,
        generationMeta: aiRes.meta,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '联网检索核验失败';
      res.status(500).json({ error: msg });
    }
  });

  // 2. Fetch Full arXiv Paper (Metadata + ar5iv HTML / LaTeX Sections)
  app.post('/api/fetch-arxiv', async (req, res) => {
    try {
      const { arxivInput } = req.body as { arxivInput?: string };
      if (!arxivInput || !arxivInput.trim()) {
        res.status(400).json({ error: '请输入有效的 arXiv 编号（如 hep-th/0603001 或 2301.00001）或英文论文标题。' });
        return;
      }

      const paperData = await fetchArxivFullTextById(arxivInput.trim());
      if (!paperData) {
        res.status(404).json({
          error: `未在 arXiv 官方库中找到「${arxivInput}」，请检查编号格式或直接粘贴英文论文正文。`,
        });
        return;
      }

      res.json(paperData);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'arXiv 论文拉取失败';
      res.status(500).json({ error: msg });
    }
  });

  // 2.5 Fetch Real Book Table of Contents on Demand for Stage 1 Preview
  app.post('/api/fetch-book-toc', async (req, res) => {
    try {
      const { title, authors, editionOrYear, customTocText } = req.body as {
        title?: string;
        authors?: string;
        editionOrYear?: string;
        customTocText?: string;
      };
      if (!title || !title.trim()) {
        res.status(400).json({ error: '请先输入书籍或论文名称。' });
        return;
      }

      const openLibData = await searchOpenLibraryWithToc(`${title} ${authors || ''}`.trim(), 2);
      const tocData = await retrieveRealBookChapters({
        title: title.trim(),
        authors: authors?.trim(),
        editionOrYear: editionOrYear?.trim(),
        openLibTocTitles: openLibData.tocTitles,
        customTocText,
      });

      res.json(tocData);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '获取章节目录失败';
      res.status(500).json({ error: msg });
    }
  });

  // 3. Analyze Single Reading Material with Precise Chapter-Range & Topic Scope Recognition (Stage 1 - 2.1)
  app.post('/api/analyze-material', async (req, res) => {
    try {
      const {
        title,
        authors,
        editionOrYear,
        readScope,
        selfReportedMastered,
        selfReportedUnfamiliar,
        customTocText,
        prefetchedChapters,
      } = req.body as {
        title: string;
        authors?: string;
        editionOrYear?: string;
        readScope: string;
        selfReportedMastered?: string;
        selfReportedUnfamiliar?: string;
        customTocText?: string;
        prefetchedChapters?: TextbookCatalogChapter[];
      };

      if (!title || !readScope) {
        res.status(400).json({ error: '请填写书籍/论文名称以及具体的阅读章节或范围。' });
        return;
      }

      const searchQ = `${title} ${authors || ''}`.trim();
      const [arxivSources, crossrefSources, openLibData] = await Promise.all([
        searchArxivApi(searchQ, 2),
        searchCrossRefApi(searchQ, 2),
        searchOpenLibraryWithToc(searchQ, 2),
      ]);
      const verifiedSources: GroundingSource[] = [
        ...crossrefSources,
        ...openLibData.sources,
        ...arxivSources,
      ];

      // Step 1: Retrieve the book's REAL chapters (from prefetchedChapters, customTocText, catalog, or live web/AI TOC extraction)
      const tocInfo =
        Array.isArray(prefetchedChapters) && prefetchedChapters.length > 0
          ? {
              chapters: prefetchedChapters,
              domain: undefined,
              resolvedAuthors: undefined,
              resolvedEdition: undefined,
              tocSourceLabel: '已使用获取到的本书真实目录',
            }
          : await retrieveRealBookChapters({
              title: title.trim(),
              authors: authors?.trim(),
              editionOrYear: editionOrYear?.trim(),
              openLibTocTitles: openLibData.tocTitles,
              customTocText,
            });

      // Step 2: Map the user's exact `readScope` onto the book's REAL chapters
      const detResult = analyzeMaterialScopeDeterministically({
        title: title.trim(),
        authors: authors?.trim() || tocInfo.resolvedAuthors,
        editionOrYear: editionOrYear?.trim() || tocInfo.resolvedEdition,
        readScope: readScope.trim(),
        selfReportedMastered: selfReportedMastered?.trim(),
        selfReportedUnfamiliar: selfReportedUnfamiliar?.trim(),
        externalChapters: tocInfo.chapters,
        customTocText,
      });

      res.json({
        ...detResult,
        domain: tocInfo.domain || detResult.domain,
        tocSourceLabel: tocInfo.tocSourceLabel,
        verifiedSources,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '分析阅读材料失败';
      res.status(500).json({ error: msg });
    }
  });

  // 4. Synthesize Full《个人知识背景分析报告》from User's Materials & Nodes (Stage 1 - 2.3)
  app.post('/api/generate-knowledge-report', async (req, res) => {
    try {
      const { materials, knowledgeNodes } = req.body as {
        materials: Array<{
          title: string;
          authors: string;
          editionOrYear: string;
          domain: string;
          readScope: string;
          parsedScopeSummary?: string;
          explicitMastered: string[];
          inferredMastered: string[];
          unlearnedOrSkipped: string[];
          mathTools: string[];
        }>;
        knowledgeNodes: Array<{
          conceptNameZh: string;
          conceptNameEn: string;
          level: string;
          epistemicStatus: string;
          rationale: string;
        }>;
      };

      if (!materials || materials.length === 0) {
        res.status(400).json({ error: '请先至少添加一部您阅读过的教材、专著或论文材料。' });
        return;
      }

      const prompt = `你是一名专业的理论物理研究者与科研导师。请根据用户录入的个人阅读材料清单（含逐章阅读范围识别结果）和知识节点，生成一份严谨、深入的《个人知识背景分析报告》，供后续理论物理论文翻译与精准批注使用。

用户已录入的阅读材料：
${JSON.stringify(materials, null, 2)}

当前提取的知识节点：
${JSON.stringify(knowledgeNodes.slice(0, 30), null, 2)}

请严格遵循以下原则：
1. 读过一本书不代表掌握了书中全部内容；不得因为某个概念出现在教材中就默认完全理解。
2. 明确总结用户的核心理论优势（K1 免批注范围）、知识判断边界防线（明确指出哪些书的哪些未读章节绝不可默认掌握），以及后续论文翻译时的 K1/K2/K3/K4 批注执行准则。

返回严格的 JSON 对象：
{
  "overallSummary": "综合知识储备画像与学术定位（详细说明用户已读哪些章节、掌握哪些理论模块与数学工具，以及未读章节导致的知识边界在哪里）",
  "strengths": ["已确立的基础理论优势1（含具体已读章节与数学工具）", "优势2", "优势3"],
  "criticalBoundaries": ["知识判断边界防线1（明确指出哪本书仅读了哪些章节，哪些未读章节绝不可默认掌握）", "防线2"],
  "annotationPolicySummary": {
    "skipK1List": ["后续翻译绝对不重复解释的 K1 知识点1", "K1 知识点2"],
    "conditionalK2List": ["仅在特殊极限或复杂推导障碍时点拨的 K2 知识点1", "K2 知识点2"],
    "mandatoryK3K4Focus": ["一旦在论文中出现必须深入解释的 K3/K4 陌生知识与未读章节缺口1", "缺口2"]
  }
}`;

      const aiRes = await generateWithCascadeDetailed(prompt, { jsonMode: true });
      let effectiveMeta = aiRes.meta;

      if (aiRes.text) {
        const jsonRes = cleanAndParseJson<{
          overallSummary?: string;
          strengths?: string[];
          criticalBoundaries?: string[];
          annotationPolicySummary?: {
            skipK1List?: string[];
            conditionalK2List?: string[];
            mandatoryK3K4Focus?: string[];
          };
        }>(aiRes.text);
        if (jsonRes.ok) {
          const parsed = jsonRes.data;
          res.json({
            report: {
              generatedAt: new Date().toISOString().slice(0, 10),
              overallSummary: parsed.overallSummary || '',
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
              criticalBoundaries: Array.isArray(parsed.criticalBoundaries)
                ? parsed.criticalBoundaries
                : [],
              annotationPolicySummary: {
                skipK1List: parsed.annotationPolicySummary?.skipK1List || [],
                conditionalK2List: parsed.annotationPolicySummary?.conditionalK2List || [],
                mandatoryK3K4Focus: parsed.annotationPolicySummary?.mandatoryK3K4Focus || [],
              },
              epistemicBreakdown: {
                providedMaterialsCount: materials.length,
                explicitMasteredCount: knowledgeNodes.filter((n) => n.epistemicStatus === '已学习知识').length,
                inferredCount: knowledgeNodes.filter((n) => n.epistemicStatus === '推测掌握知识').length,
                unknownCount: knowledgeNodes.filter((n) => n.epistemicStatus === '未知知识').length,
              },
              groundingSources: [],
              generationMeta: effectiveMeta,
            },
          });
          return;
        }
        effectiveMeta = buildDegradedMeta('PARSE_ERROR', jsonRes.error, true);
      }

      const matNames = materials
        .map((m) => `《${m.title}》（录入范围：${m.readScope}；${m.parsedScopeSummary || ''}）`)
        .join('；');
      const allExplicit = materials.flatMap((m) => m.explicitMastered);
      const allInferred = materials.flatMap((m) => m.inferredMastered);
      const allSkipped = materials.flatMap((m) =>
        m.unlearnedOrSkipped.slice(0, 5).map((u) => `《${m.title}》${u}`)
      );

      res.json({
        report: {
          generatedAt: new Date().toISOString().slice(0, 10),
          overallSummary: `基于您提交的 ${materials.length} 部学习材料（${matNames}），系统已完成章节级本地结构化知识背景建模。您在已读章节（${allExplicit.slice(0, 4).join('；')}）具备基础掌握（列为 K1）；对 ${allInferred.slice(0, 3).join('；')} 列为 K2；并将未读章节（${allSkipped.slice(0, 4).join('；')}）列为 K3 陌生知识缺口。`,
          strengths: allExplicit.slice(0, 6).map((e) => `已明确掌握：${e}（纳入 K1，后续论文翻译不再赘述）`),
          criticalBoundaries: materials.map(
            (m) =>
              `《${m.title}》实际阅读范围为「${m.readScope}」（${m.parsedScopeSummary || '已区分已读与未读章节'}），绝不可默认掌握其未读部分（${m.unlearnedOrSkipped.slice(0, 3).join('；') || '后续高阶章节'}）`
          ),
          annotationPolicySummary: {
            skipK1List: allExplicit.length > 0 ? allExplicit.slice(0, 8) : ['已明确掌握的基础定义与常规运算'],
            conditionalK2List: allInferred.length > 0 ? allInferred.slice(0, 6) : ['阅读范围内的高阶复杂变体推导'],
            mandatoryK3K4Focus:
              allSkipped.length > 0
                ? allSkipped.slice(0, 8)
                : ['超出已读章节范围的陌生理论、被作者省略的关键推导步骤及论文原创模型 (K3 & K4)'],
          },
          epistemicBreakdown: {
            providedMaterialsCount: materials.length,
            explicitMasteredCount: knowledgeNodes.filter((n) => n.epistemicStatus === '已学习知识').length,
            inferredCount: knowledgeNodes.filter((n) => n.epistemicStatus === '推测掌握知识').length,
            unknownCount: knowledgeNodes.filter((n) => n.epistemicStatus === '未知知识').length,
          },
          groundingSources: [],
          generationMeta: effectiveMeta,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '生成个人知识背景分析报告失败';
      res.status(500).json({ error: msg });
    }
  });

  // 5. Paper Pre-Analysis & Translation Endpoint (Stages 2 & 3)
  app.post('/api/process-custom-paper', async (req, res) => {
    try {
      const {
        mode,
        titleEn,
        authors,
        arxivIdOrDoi,
        rawEnglishText,
        materials,
        knowledgeNodes,
        annotationDetailLevel,
      } = req.body as {
        mode: 'pre_analyze' | 'translate_full';
        titleEn: string;
        authors?: string;
        arxivIdOrDoi?: string;
        rawEnglishText: string;
        materials?: Array<{
          title: string;
          readScope: string;
          parsedScopeSummary?: string;
          explicitMastered: string[];
          unlearnedOrSkipped: string[];
        }>;
        knowledgeNodes: Array<{
          conceptNameZh: string;
          conceptNameEn: string;
          level: string;
          epistemicStatus: string;
          rationale?: string;
        }>;
        annotationDetailLevel?: number;
      };

      const detailLevel = normalizeAnnotationDetailLevel(annotationDetailLevel);
      const detailProfile = getAnnotationDetailProfile(detailLevel);

      if (!rawEnglishText || !rawEnglishText.trim()) {
        res.status(400).json({ error: '请提供待分析或翻译的英文理论物理论文内容。' });
        return;
      }

      const searchQuery = arxivIdOrDoi || titleEn || rawEnglishText.slice(0, 100);
      const [arxivSources, crossrefSources] = await Promise.all([
        searchArxivApi(searchQuery, 3),
        searchCrossRefApi(searchQuery, 2),
      ]);
      const groundingSources: GroundingSource[] = [...arxivSources, ...crossrefSources];

      const k1Summary = (knowledgeNodes || [])
        .filter((n) => n.level === 'K1')
        .map((n) => `${n.conceptNameZh} (${n.conceptNameEn})`)
        .join('；');
      const k2Summary = (knowledgeNodes || [])
        .filter((n) => n.level === 'K2')
        .map((n) => `${n.conceptNameZh} (${n.conceptNameEn})`)
        .join('；');
      const k3k4Summary = (knowledgeNodes || [])
        .filter((n) => n.level === 'K3' || n.level === 'K4')
        .map((n) => `${n.conceptNameZh} (${n.conceptNameEn})`)
        .join('；');
      const materialsContext = (materials || [])
        .map(
          (m) =>
            `《${m.title}》(录入范围: ${m.readScope}; ${m.parsedScopeSummary || ''}; 已掌握: ${m.explicitMastered.slice(0, 4).join(',')}; 未读缺口: ${m.unlearnedOrSkipped.slice(0, 4).join(',')})`
        )
        .join('；');

      let effectiveMeta: GenerationMeta = buildDegradedMeta(
        'UNKNOWN_ERROR',
        '尚未调用 Gemini 生成',
        true
      );

      if (mode === 'pre_analyze') {
        const prompt = `你是一名专业的理论物理研究者、学术翻译专家和科研导师。
现在处于工作流程中的【第三步与第四步：分析待翻译论文的研究方向、章节结构和知识难度，并对照个人知识模型判断每个章节的知识缺口】（未经用户确认，绝不直接开始全文翻译）。

用户的个人知识背景模型如下：
- 已读教材与章节范围：${materialsContext || '用户自定义知识背景'}
- K1（基础知识，已掌握，无需重复解释）：${k1Summary || '无'}
- K2（相关知识，接触过但复杂推导可能不熟）：${k2Summary || '无'}
- K3/K4（陌生知识与未读章节缺口，必须重点批注）：${k3k4Summary || '超出上述 K1 范围的所有高阶理论物理概念'}

${buildGeminiAnnotationDetailDirective(detailLevel, 'pre_analysis')}

待分析的英文理论物理论文：
标题：${titleEn || 'Theoretical Physics Manuscript'}
作者：${authors || '待核实'}
文献标识：${arxivIdOrDoi || '待核实'}
论文英文原文（若超长已摘取核心节段）：
${rawEnglishText.slice(0, 26000)}

请输出严格的 JSON 对象：
{
  "titleZh": "准确的中文学术标题",
  "authors": "核实后的作者名",
  "researchDirection": "研究方向与所属理论物理分支",
  "overallDifficulty": "知识难度评估（结合用户已读教材章节进行对比定位）",
  "coreInnovationSummary": "论文核心理论模型、物理机制与论证结构概述",
  "mathPrerequisitesRequired": ["理解该文所需的数学工具1（明确标注用户是否已在K1掌握或属K3未读章节缺口）", "数学工具2", "数学工具3"],
  "sectionGaps": [
    {
      "sectionNumber": "第 1 节",
      "sectionTitleEn": "Original Section Title",
      "sectionTitleZh": "中文小节标题",
      "difficulty": "基础过渡 或 中等进阶 或 高难核心 或 前沿原创",
      "k1ConceptsToSkip": ["本节中属于用户已读章节 (K1)、翻译时将跳过批注的概念"],
      "k2ConceptsConditional": ["本节中属于 K2 相关知识的概念"],
      "k3UnknownGaps": ["本节中恰好落在用户未读章节范围、属于 K3 陌生知识缺口的概念"],
      "k4PaperSpecificInnovations": ["本节中属于 K4 论文专属新模型、新推导或作者特有论证方式的内容"],
      "plannedAnnotationCount": 2,
      "gapAnalysisSummary": "本节对照用户已读章节范围的具体批注策略说明"
    }
  ]
}`;

        const aiRes = await generateWithCascadeDetailed(prompt, { jsonMode: true });
        effectiveMeta = aiRes.meta;

        if (aiRes.text) {
          const parsedRes = cleanAndParseJson<{
            titleZh?: string;
            authors?: string;
            researchDirection?: string;
            overallDifficulty?: string;
            coreInnovationSummary?: string;
            mathPrerequisitesRequired?: unknown[];
            sectionGaps?: unknown[];
          }>(aiRes.text);
          if (parsedRes.ok) {
            const parsed = parsedRes.data;
            res.json({
              preAnalysis: {
                paperId: `paper-${Date.now()}`,
                titleEn: titleEn || 'Theoretical Physics Manuscript',
                titleZh: parsed.titleZh || '理论物理论文预分析报告',
                authors: parsed.authors || authors || 'Original Authors',
                arxivIdOrDoi: arxivIdOrDoi || (arxivSources[0]?.uri ?? 'Manuscript'),
                researchDirection: parsed.researchDirection || '理论物理',
                overallDifficulty: parsed.overallDifficulty || '研究生高阶水平',
                coreInnovationSummary: parsed.coreInnovationSummary || '',
                mathPrerequisitesRequired: Array.isArray(parsed.mathPrerequisitesRequired)
                  ? parsed.mathPrerequisitesRequired
                  : [],
                sectionGaps: Array.isArray(parsed.sectionGaps) ? parsed.sectionGaps : [],
                confirmedByUser: false,
                groundingSources,
                generationMeta: effectiveMeta,
              },
            });
            return;
          }
          effectiveMeta = buildDegradedMeta('PARSE_ERROR', parsedRes.error, true);
        }
      } else {
        // mode === 'translate_full'
        const prompt = `你是一名专业的理论物理研究者、学术翻译专家和科研导师。
用户已经确认了个人知识背景模型与论文预分析，现在请执行第五至第八步：将用户提供的英文理论物理论文完整翻译为一份【纯中文版深度学术批注文稿】。

用户的个人知识背景模型：
- 已读教材与章节范围：${materialsContext || '用户自定义知识背景'}
- K1（已掌握基础知识，严禁在批注中重复解释！）：${k1Summary || '无'}
- K2（相关知识，仅在复杂推导障碍处批注）：${k2Summary || '无'}
- K3/K4（未读章节陌生知识与论文专属知识，必须深入、完整、准确批注）：${k3k4Summary || '论文中的陌生概念与核心推导'}

请严格遵守以下全部规范：
1. 纯中文版批注文档，正文只呈现中文翻译，不采用中英文双栏；保留数学公式、编号、脚注和参考文献标记；专业术语首次出现时采用「中文术语（English Term）」，后续统一使用中文术语。
2. 绝对不要解释用户已在 K1 掌握的基础知识！批注类型只允许以下五种：「理论解释」「数学推导」「物理机制」「前置知识」「关键辨析」。
3. 公式推导严格区分：「原文推导」「补充推导」「独立核验」。

${buildGeminiAnnotationDetailDirective(detailLevel, 'translation')}

待翻译的英文理论物理论文：
标题：${titleEn}
作者：${authors || ''}
文献标识：${arxivIdOrDoi || ''}
英文原文：
${rawEnglishText}

请输出严格符合以下 JSON 结构的完整文稿：
{
  "titleZh": "准确的中文学术标题",
  "authors": "作者姓名",
  "institutionOrJournal": "期刊或预印本信息",
  "abstractZh": "完整的中文学术摘要",
  "sections": [
    {
      "sectionNumber": "1",
      "titleZh": "小节中文标题",
      "titleEn": "Original Section Title",
      "paragraphs": [
        {
          "id": "p-1-1",
          "paragraphIndex": 1,
          "statementType": "正文论述 或 基本假设 或 严格定义 或 核心定理/引理 或 关键推论 或 物理结论",
          "originalEnExcerpt": "对应的英文原文段落",
          "translatedZhText": "完整、准确的纯中文学术译文（首次出现专业术语带英文括号，行内公式用 $...$）",
          "equations": [
            { "number": "1.1", "latex": "单独成行的核心数学公式 LaTeX（不含$$）" }
          ],
          "annotations": [
            {
              "id": "ann-1-1",
              "type": "理论解释 或 数学推导 或 物理机制 或 前置知识 或 关键辨析",
              "targetConceptZh": "批注目标概念中文",
              "targetConceptEn": "Target Concept English",
              "targetEquationOrClause": "具体对应的公式编号或正文论断",
              "knowledgeLevelTag": "K2 或 K3 或 K4",
              "derivationAuthenticity": "原文推导 或 补充推导 或 独立核验",
              "verificationStatus": "已核验 或 待核实 或 存在学术争议",
              "whatItIs": "深入解释：这个概念或问题究竟是什么？",
              "whyHereAndRole": "它为什么出现在这里？为什么用户已读章节不足以直接看懂此处？",
              "prerequisitesNeeded": "理解它真正必需的前置知识补充",
              "mathOrPhysicalMechanism": "深入的数学结构或物理图像机制",
              "commonMisconceptions": "容易产生的误解或特殊适用条件辨析",
              "impactOnSubsequentArgs": "它对后续论证有什么影响？",
              "formulaAnalysis": {
                "equationNumber": "1.1",
                "latex": "被分析公式的 LaTeX",
                "symbols": [
                  { "symbolLatex": "符号LaTeX", "meaningZh": "符号的精确物理与数学含义" }
                ],
                "originAndContext": "公式来源与上下文关系",
                "mathematicalBasis": "数学推导依据",
                "theoremsUsed": ["使用的数学定理或物理原理"],
                "validityConditions": "公式成立的物理假设与数学适用范围",
                "roleInPaper": "公式在论文中的核心作用",
                "derivationSteps": [
                  {
                    "stepIndex": 1,
                    "sourceType": "原文推导 或 补充推导 或 独立核验",
                    "descriptionZh": "详细的推导步骤文字说明",
                    "latex": "该步骤对应的数学公式 LaTeX（不含$$）"
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ],
  "terminologyTable": [
    {
      "termZh": "中文术语",
      "termEn": "English Term",
      "firstAppearanceSection": "第 1 节",
      "category": "理论物理分支",
      "knowledgeLevel": "K1 或 K2 或 K3 或 K4",
      "definitionSummary": "精确学术定义"
    }
  ],
  "citations": [
    {
      "citeKey": "[1]",
      "authorsAndYear": "作者 (年份)",
      "title": "文献标题",
      "doiOrArxiv": "核实后的 DOI 或 arXiv 编号",
      "status": "已核验 或 待核实",
      "verificationNote": "文献权威性及与本文的关系说明",
      "url": "https://arxiv.org/abs/..."
    }
  ]
}`;

        const aiRes = await generateWithCascadeDetailed(prompt, { jsonMode: true, timeoutMs: 60000 });
        effectiveMeta = aiRes.meta;
        if (aiRes.text) {
          const parsedRes = cleanAndParseJson<{
            titleZh?: string;
            authors?: string;
            institutionOrJournal?: string;
            abstractZh?: string;
            sections?: TranslatedSection[];
            terminologyTable?: TerminologyEntry[];
            citations?: unknown[];
          }>(aiRes.text);
          if (parsedRes.ok) {
            const parsed = parsedRes.data;
            res.json({
              translatedDoc: {
                paperId: `doc-${Date.now()}`,
                titleZh: parsed.titleZh || '理论物理论文中文深度批注文稿',
                titleEn: titleEn || 'Theoretical Physics Manuscript',
                authors: parsed.authors || authors || 'Paper Authors',
                institutionOrJournal: parsed.institutionOrJournal || '理论物理学术论文 / arXiv',
                arxivIdOrDoi: arxivIdOrDoi || '待核实',
                abstractZh: parsed.abstractZh || '',
                sections: Array.isArray(parsed.sections) ? parsed.sections : [],
                terminologyTable: Array.isArray(parsed.terminologyTable)
                  ? parsed.terminologyTable
                  : [],
                citations: Array.isArray(parsed.citations) ? parsed.citations : [],
                groundingSources,
                generationMeta: effectiveMeta,
              },
            });
            return;
          }
          effectiveMeta = buildDegradedMeta('PARSE_ERROR', parsedRes.error, true);
        }
      }

      // Honest degraded fallback built strictly from the user's real sections/paragraphs
      const detectedChunks = splitPaperIntoSectionChunks(rawEnglishText, {
        fallbackTitleEn: titleEn || 'Main Theoretical Formulation',
      });

      if (mode === 'pre_analyze') {
        res.json({
          preAnalysis: {
            paperId: `paper-${Date.now()}`,
            titleEn: titleEn || 'Theoretical Physics Manuscript',
            titleZh: `${titleEn || '理论物理英文论文'}（本地章节结构预分析）`,
            authors: authors || 'Original Authors',
            arxivIdOrDoi: arxivIdOrDoi || '待核实',
            researchDirection: '理论物理（待 Gemini 实时细化）',
            overallDifficulty: '已按本地结构切分，待实时模型评估',
            coreInnovationSummary:
              `已自动识别出待译论文的 ${detectedChunks.length} 个章节切片。由于实时 Gemini 分析暂未就绪（${effectiveMeta.reason}），以下先列出从您原文提取的真实章节结构，您可直接点击重试获取完整语义缺口诊断，或确认后进入分节翻译。`,
            mathPrerequisitesRequired: [
              `已掌握 K1 基础（免批注）：${k1Summary || '已读章节内的基础工具'}`,
              `重点关注 K3/K4 缺口：${k3k4Summary || '超出已读章节范围的新推导与假设'}`,
            ],
            sectionGaps: detectedChunks.map((chunk) => ({
              sectionNumber: chunk.sectionNumber ? `第 ${chunk.sectionNumber} 节` : `第 ${chunk.chunkIndex + 1} 节`,
              sectionTitleEn: chunk.sectionTitleEn,
              sectionTitleZh: chunk.sectionTitleEn,
              difficulty: '高难核心' as const,
              k1ConceptsToSkip: k1Summary ? k1Summary.split('；').slice(0, 3) : ['已掌握基础'],
              k2ConceptsConditional: k2Summary ? k2Summary.split('；').slice(0, 2) : [],
              k3UnknownGaps: k3k4Summary
                ? k3k4Summary.split('；').slice(0, 3)
                : ['本节待实时翻译时对照 K3/K4 展开'],
              k4PaperSpecificInnovations: ['保留原文公式与核心论证结构'],
              plannedAnnotationCount: Math.max(
                1,
                Math.round(chunk.paragraphCount * detailProfile.annotationCountMultiplier)
              ),
              gapAnalysisSummary: `本地识别切片（约 ${chunk.charCount} 字符，${chunk.paragraphCount} 段），已按 Lv.${detailLevel} ${detailProfile.shortLabel} 策略排队。`,
            })),
            confirmedByUser: false,
            groundingSources,
            generationMeta: effectiveMeta,
          },
        });
      } else {
        const degradedSections = detectedChunks.map((chunk) =>
          buildFallbackSectionFromChunk(chunk, effectiveMeta.reason, effectiveMeta)
        );
        res.json({
          translatedDoc: {
            paperId: `doc-${Date.now()}`,
            titleZh: `${titleEn || '理论物理论文'}（降级原文保留视图）`,
            titleEn: titleEn || 'Theoretical Physics Manuscript',
            authors: authors || 'Original Authors',
            institutionOrJournal: '理论物理学术文稿',
            arxivIdOrDoi: arxivIdOrDoi || '待核实',
            abstractZh: `实时 Gemini 翻译未能完成（原因：${effectiveMeta.reason}）。系统已完整保留您导入的 ${detectedChunks.length} 个章节原文及行间公式，绝不使用无关范文替代；请点击上方或各章节「重试」按钮恢复实时中文深度批注。`,
            sections: degradedSections,
            terminologyTable: [],
            citations: groundingSources.map((s, i) => ({
              citeKey: `[${i + 1}]`,
              authorsAndYear: s.sourceType,
              title: s.title,
              doiOrArxiv: s.uri,
              status: '已核验' as const,
              verificationNote: s.snippet || '通过互联网学术数据库实时检索核验',
              url: s.uri,
            })),
            groundingSources,
            generationMeta: effectiveMeta,
            chunkStatusSummary: {
              totalChunks: detectedChunks.length,
              geminiChunks: 0,
              degradedChunks: detectedChunks.length,
              failedChunks: 0,
            },
          },
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '处理论文失败';
      res.status(500).json({ error: msg });
    }
  });

  // 5.5 Section-by-Section Chunked Paper Translation Endpoint (Anti-Truncation for Long Papers)
  app.post('/api/translate-chunk', async (req, res) => {
    try {
      const {
        chunk,
        titleEn,
        titleZh,
        authors,
        materials,
        knowledgeNodes,
        annotationDetailLevel,
        includeAbstract,
      } = req.body as {
        chunk: PaperSectionChunk;
        titleEn: string;
        titleZh?: string;
        authors?: string;
        materials?: Array<{
          title: string;
          readScope: string;
          parsedScopeSummary?: string;
          explicitMastered: string[];
          unlearnedOrSkipped: string[];
        }>;
        knowledgeNodes?: Array<{
          conceptNameZh: string;
          conceptNameEn: string;
          level: string;
        }>;
        annotationDetailLevel?: number;
        includeAbstract?: boolean;
      };

      if (!chunk || !chunk.rawChunkText || !chunk.rawChunkText.trim()) {
        res.status(400).json({ error: '缺少待翻译的论文章节切片文本。' });
        return;
      }

      const detailLevel = normalizeAnnotationDetailLevel(annotationDetailLevel);
      const k1Summary = (knowledgeNodes || [])
        .filter((n) => n.level === 'K1')
        .map((n) => `${n.conceptNameZh} (${n.conceptNameEn})`)
        .join('；');
      const k2Summary = (knowledgeNodes || [])
        .filter((n) => n.level === 'K2')
        .map((n) => `${n.conceptNameZh} (${n.conceptNameEn})`)
        .join('；');
      const k3k4Summary = (knowledgeNodes || [])
        .filter((n) => n.level === 'K3' || n.level === 'K4')
        .map((n) => `${n.conceptNameZh} (${n.conceptNameEn})`)
        .join('；');
      const materialsContext = (materials || [])
        .map((m) => `《${m.title}》(录入范围: ${m.readScope}; ${m.parsedScopeSummary || ''})`)
        .join('；');

      const sourceParagraphs = chunk.rawChunkText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      const numberedSourceText = sourceParagraphs
        .map((p, idx) => `[Paragraph ${idx + 1}]\n${p}`)
        .join('\n\n');

      const prompt = `你是一名专业的理论物理研究者、学术翻译专家和科研导师。
现在正在对一篇英文理论物理论文执行【分节深度学术翻译与 K1–K4 精准批注】（第 ${chunk.chunkIndex + 1} / ${chunk.totalChunks} 切片）。

论文元信息：
- 原文标题：${titleEn || 'Theoretical Physics Manuscript'}
- 中文标题参考：${titleZh || ''}
- 作者：${authors || ''}
- 当前切片所属章节：${chunk.sectionNumber} · ${chunk.sectionTitleEn}

用户个人知识背景模型：
- 已读教材范围：${materialsContext || '用户自定义背景'}
- K1（已掌握，严禁重复批注！）：${k1Summary || '无'}
- K2（相关知识，仅难点提示）：${k2Summary || '无'}
- K3/K4（陌生或原创知识，必须深度展开）：${k3k4Summary || '高阶理论与论文新推导'}

${buildGeminiAnnotationDetailDirective(detailLevel, 'translation')}

请严格遵守以下逐段翻译与格式要求：
1. 下方本节原文共包含 ${sourceParagraphs.length} 个自然段（[Paragraph 1] 至 [Paragraph ${sourceParagraphs.length}]）。请尽量按 1:1 对应关系输出 paragraphs 数组，切勿将多个长自然段合并浓缩为单一段落！
2. 首次出现专业术语带英文括号「中文术语（English Term）」，保留所有行内 $...$ 与独立行间公式（放入 equations 数组，不含外层 $$）；JSON 字符串中的 LaTeX 反斜杠必须双写转义（如 \\\\frac、\\\\rho、\\\\mathrm）。
3. 严禁将基金资助机构（如 DFG、NSF、卓越集群等）、大学研究所名称或致谢用语放入 terminologyItems！terminologyItems 只允许收录纯粹的物理、数学与模型术语。

本节英文原文（共 ${sourceParagraphs.length} 段）：
${numberedSourceText}

请输出严格 JSON 对象（禁止 markdown 代码块之外的多余说明）：
{
  ${includeAbstract ? `"titleZh": "准确的中文论文标题",\n  "translatedAbstractZh": "若本切片包含摘要或导言则给出完整中文摘要，否则留空字符串",` : ''}
  "section": {
    "sectionNumber": "${chunk.sectionNumber || String(chunk.chunkIndex + 1)}",
    "titleZh": "本节中文标题",
    "titleEn": "${chunk.sectionTitleEn.replace(/"/g, '\\"')}",
    "paragraphs": [
      {
        "id": "p-c${chunk.chunkIndex + 1}-1",
        "paragraphIndex": 1,
        "statementType": "正文论述 或 基本假设 或 严格定义 或 核心定理/引理 或 关键推论 或 物理结论",
        "originalEnExcerpt": "对应英文原文段落",
        "translatedZhText": "完整准确的纯中文学术译文",
        "equations": [
          { "number": "${chunk.sectionNumber || String(chunk.chunkIndex + 1)}.1", "latex": "独立行间公式 LaTeX（不含$$）" }
        ],
        "annotations": [
          {
            "id": "ann-c${chunk.chunkIndex + 1}-1-1",
            "type": "理论解释 或 数学推导 或 物理机制 或 前置知识 或 关键辨析",
            "targetConceptZh": "批注目标概念中文",
            "targetConceptEn": "Target Concept English",
            "targetEquationOrClause": "对应公式或论断（若有公式请包裹 $...$）",
            "knowledgeLevelTag": "K2 或 K3 或 K4",
            "derivationAuthenticity": "原文推导 或 补充推导 或 独立核验",
            "verificationStatus": "已核验 或 待核实",
            "whatItIs": "概念实质与定义",
            "whyHereAndRole": "在此处的作用与教材衔接障碍",
            "prerequisitesNeeded": "必需前置知识（按当前详略度决定）",
            "mathOrPhysicalMechanism": "数学结构或物理机制解析",
            "commonMisconceptions": "常见误区辨析",
            "impactOnSubsequentArgs": "对后续论证的影响",
            "formulaAnalysis": {
              "equationNumber": "${chunk.sectionNumber || String(chunk.chunkIndex + 1)}.1",
              "latex": "被分析公式 LaTeX",
              "symbols": [{ "symbolLatex": "符号", "meaningZh": "含义" }],
              "originAndContext": "来源上下文",
              "mathematicalBasis": "数学依据",
              "theoremsUsed": ["使用的定理"],
              "validityConditions": "适用条件",
              "roleInPaper": "在本文中的作用",
              "derivationSteps": [
                {
                  "stepIndex": 1,
                  "sourceType": "原文推导 或 补充推导 或 独立核验",
                  "descriptionZh": "推导步骤说明",
                  "latex": "步骤公式 LaTeX"
                }
              ]
            }
          }
        ]
      }
    ]
  },
  "terminologyItems": [
    {
      "termZh": "中文物理术语",
      "termEn": "English Physics Term",
      "firstAppearanceSection": "第 ${chunk.sectionNumber || String(chunk.chunkIndex + 1)} 节",
      "category": "理论物理分支",
      "knowledgeLevel": "K1 或 K2 或 K3 或 K4",
      "definitionSummary": "精确定义"
    }
  ]
}`;

      const aiRes = await generateWithCascadeDetailed(prompt, { jsonMode: true, timeoutMs: 55000 });
      let effectiveMeta = aiRes.meta;

      if (aiRes.text) {
        const parsedRes = cleanAndParseJson<{
          titleZh?: string;
          translatedAbstractZh?: string;
          section?: TranslatedSection;
          terminologyItems?: TerminologyEntry[];
        }>(aiRes.text);

        if (
          parsedRes.ok &&
          parsedRes.data.section &&
          Array.isArray(parsedRes.data.section.paragraphs) &&
          parsedRes.data.section.paragraphs.length > 0
        ) {
          const sec = parsedRes.data.section;
          // Ensure no source $$...$$ display equations from the chunk were dropped by the model
          const sourceDisplayEqs = [...chunk.rawChunkText.matchAll(/\$\$([\s\S]+?)\$\$/g)]
            .map((m) => m[1].trim())
            .filter(Boolean);
          const existingEqLatexSet = new Set(
            sec.paragraphs.flatMap((p) => (p.equations || []).map((e) => e.latex.replace(/\s+/g, '')))
          );
          if (sourceDisplayEqs.length > 0 && sec.paragraphs.length > 0) {
            const missingEqs = sourceDisplayEqs.filter(
              (eq) => !existingEqLatexSet.has(eq.replace(/\s+/g, ''))
            );
            if (missingEqs.length > 0) {
              const targetPara = sec.paragraphs[0];
              const baseEqs = Array.isArray(targetPara.equations) ? [...targetPara.equations] : [];
              missingEqs.forEach((latex, idx) => {
                baseEqs.push({
                  number: `${chunk.sectionNumber || chunk.chunkIndex + 1}.${baseEqs.length + idx + 1}`,
                  latex,
                });
              });
              targetPara.equations = baseEqs;
            }
          }

          const cleanTerms = Array.isArray(parsedRes.data.terminologyItems)
            ? parsedRes.data.terminologyItems.filter(
                (t) =>
                  !isNonPhysicsAdministrativeTerm(
                    t.termZh,
                    t.termEn,
                    t.category,
                    t.definitionSummary
                  )
              )
            : [];

          res.json({
            chunkIndex: chunk.chunkIndex,
            sectionNumber: sec.sectionNumber || chunk.sectionNumber,
            sectionTitleEn: sec.titleEn || chunk.sectionTitleEn,
            status: 'completed',
            titleZh: parsedRes.data.titleZh,
            translatedAbstractZh: parsedRes.data.translatedAbstractZh,
            section: {
              ...sec,
              chunkIndex: chunk.chunkIndex,
              generationMeta: effectiveMeta,
            },
            terminologyItems: cleanTerms,
            generationMeta: effectiveMeta,
          });
          return;
        }
        effectiveMeta = buildDegradedMeta(
          'PARSE_ERROR',
          parsedRes.ok ? '模型返回的章节段落数组为空' : parsedRes.error,
          true
        );
      }

      const fallbackSection = buildFallbackSectionFromChunk(
        chunk,
        effectiveMeta.reason,
        effectiveMeta
      );

      res.json({
        chunkIndex: chunk.chunkIndex,
        sectionNumber: chunk.sectionNumber,
        sectionTitleEn: chunk.sectionTitleEn,
        status: 'degraded',
        section: fallbackSection,
        terminologyItems: [],
        generationMeta: effectiveMeta,
        errorMessage: effectiveMeta.reason,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '单节论文翻译失败';
      res.status(500).json({ error: msg });
    }
  });

  // 6. Interactive Deep-Dive Equation / Concept Tutor Endpoint (Stage 5)
  app.post('/api/deep-dive-query', async (req, res) => {
    try {
      const {
        conceptZh,
        conceptEn,
        equationLatex,
        userQuestion,
        knowledgeNodes,
        annotationDetailLevel,
      } = req.body as {
        conceptZh: string;
        conceptEn: string;
        equationLatex?: string;
        userQuestion: string;
        knowledgeNodes?: Array<{ conceptNameZh: string; level: string }>;
        annotationDetailLevel?: number;
      };
      const detailLevel = normalizeAnnotationDetailLevel(annotationDetailLevel);
      const detailProfile = getAnnotationDetailProfile(detailLevel);

      if (!userQuestion || !userQuestion.trim()) {
        res.status(400).json({ error: '请输入您对该公式或物理机制的具体疑问。' });
        return;
      }

      const [arxivSources, crossrefSources] = await Promise.all([
        searchArxivApi(`${conceptEn} ${userQuestion}`.slice(0, 80), 2),
        searchCrossRefApi(`${conceptEn}`, 2),
      ]);
      const sources: GroundingSource[] = [...arxivSources, ...crossrefSources];

      const k1List = (knowledgeNodes || [])
        .filter((n) => n.level === 'K1')
        .map((n) => n.conceptNameZh)
        .join('、');

      const prompt = `你是一名理论物理科研导师。用户在阅读论文中的概念「${conceptZh} (${conceptEn})」${equationLatex ? `（涉及公式：$$${equationLatex}$$）` : ''} 时提出了以下具体问题：
「${userQuestion}」

用户已掌握的 K1 基础知识包括：${k1List || '用户已录入的 K1 基础知识'}。
${buildGeminiAnnotationDetailDirective(detailLevel, 'deep_dive')}

请严格遵循以下要求进行回答：
1. 诊断用户遇到该问题的真正知识障碍（究竟是卡在某个被作者省略的数学恒等式，还是物理图像混淆）；
2. 利用用户已掌握的 K1 工具作为跳板，按当前详略度设置给出【补充推导】与【独立核验】步骤（使用清晰的 $...$ 或 $$...$$ LaTeX 公式）；
3. 明确指出是否需要将相关前置概念动态调整至 K3 并补充说明。`;

      const aiRes = await generateWithCascadeDetailed(prompt);
      if (aiRes.text) {
        res.json({
          answerMarkdown: aiRes.text,
          recommendedLevelChange: 'K3',
          obstacleDiagnosis: `已定位针对「${conceptZh}」的推导衔接障碍（当前批注详略度：Lv.${detailLevel} ${detailProfile.shortLabel}）。`,
          sources,
          generationMeta: aiRes.meta,
        });
        return;
      }

      res.json({
        answerMarkdown:
          `> **▲ 当前处于本地公式推导骨架模式**（原因：${aiRes.meta.reason || 'Gemini 响应失败'}）\n\n` +
          `1. **待诊断概念**：「${conceptZh}」— 您的问题：「${userQuestion}」\n` +
          (equationLatex
            ? `2. **关联目标公式**：\n$$${equationLatex}$$\n`
            : '2. **关联公式**：无独立公式，请点击重试由 Gemini 结合段落语境生成完整推导。\n'),
        recommendedLevelChange: 'K3',
        obstacleDiagnosis: `实时深度推导降级（${aiRes.meta.reason || '服务不可用'}）`,
        sources,
        generationMeta: aiRes.meta,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '深度追问解答失败';
      res.status(500).json({ error: msg });
    }
  });

  // 7. Parse Uploaded PDF Paper File (Stage 2 PDF Import)
  app.post('/api/parse-pdf', async (req, res) => {
    try {
      const { fileName, pdfBase64 } = req.body as {
        fileName?: string;
        pdfBase64?: string;
      };
      if (!pdfBase64 || !pdfBase64.trim()) {
        res.status(400).json({ error: '未收到有效的 PDF 文件内容。' });
        return;
      }

      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
      const buffer = Buffer.from(cleanBase64, 'base64');
      const uint8Array = new Uint8Array(buffer);

      let rawExtractedText = '';
      let pageCount = 1;

      // Primary extraction via unpdf (PDF.js serverless build)
      try {
        const pdfData = await extractText(uint8Array, { mergePages: true });
        rawExtractedText = normalizeExtractedPdfText((pdfData.text || '').trim());
        pageCount = pdfData.totalPages || 1;
      } catch {
        // Fallback: extract printable ASCII/UTF-8 text streams from raw PDF bytes
        const rawLatin = buffer.toString('latin1');
        const textChunks = [...rawLatin.matchAll(/\(([^()]{3,200})\)/g)]
          .map((m) => m[1].replace(/\\[nrt]/g, ' ').trim())
          .filter((s) => /[A-Za-z]{3,}/.test(s));
        rawExtractedText = normalizeExtractedPdfText(textChunks.join(' '));
      }

      const cleanFileNameTitle = (fileName || 'Theoretical Physics Manuscript')
        .replace(/\.pdf$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      // Check if PDF text or filename contains an arXiv ID or DOI
      const arxivMatch =
        rawExtractedText.slice(0, 1500).match(/arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i) ||
        cleanFileNameTitle.match(/^(\d{4}\.\d{4,5}(?:v\d+)?)$/);
      const doiFromPdf = extractDoiFromQuery(rawExtractedText.slice(0, 2500));

      let titleEn = cleanFileNameTitle;
      let authors = '';
      let arxivIdOrDoi = arxivMatch ? `arXiv:${arxivMatch[1]}` : doiFromPdf ? `DOI:${doiFromPdf}` : '';
      let enrichedText = rawExtractedText;
      let extractionMethod = 'unpdf_direct';

      if (arxivMatch) {
        const arxivData = await fetchArxivFullTextById(arxivMatch[1]);
        if (arxivData) {
          titleEn = arxivData.title || titleEn;
          authors = arxivData.authors || authors;
          arxivIdOrDoi = arxivData.uri || arxivIdOrDoi;
          if (arxivData.fullTextSections && arxivData.fullTextSections.length > rawExtractedText.length * 0.5) {
            enrichedText = arxivData.fullTextSections;
            extractionMethod = 'unpdf_plus_ar5iv_latex';
          }
        }
      }

      // Attempt Gemini multimodal / text reconstruction to restore clean LaTeX equations & metadata
      const aiPrompt = `You are a theoretical physics LaTeX & PDF parser. Extract the exact paper title, authors, arXiv ID / DOI (if present), and reconstruct the paper's sections and mathematical equations in clean standard LaTeX ($...$ for inline math, $$...$$ for display equations). Preserve full length without truncating sections.
${rawExtractedText ? `Extracted raw text from PDF (${pageCount} pages, showing up to 28000 chars):\n${rawExtractedText.slice(0, 28000)}` : 'Please read the attached PDF document.'}

Return strict JSON:
{
  "titleEn": "Exact English Paper Title",
  "authors": "Author 1, Author 2",
  "arxivIdOrDoi": "arXiv ID or DOI if found",
  "reconstructedTextWithLatex": "Structured English text of the paper with section headers and restored LaTeX equations"
}`;

      const aiRes = await generateWithCascadeDetailed(aiPrompt, {
        jsonMode: true,
        pdfBase64: rawExtractedText.length < 200 ? cleanBase64 : undefined,
      });
      let pdfWarning: string | undefined;

      if (aiRes.text) {
        const parsedRes = cleanAndParseJson<{
          titleEn?: string;
          authors?: string;
          arxivIdOrDoi?: string;
          reconstructedTextWithLatex?: string;
        }>(aiRes.text);
        if (parsedRes.ok) {
          const parsed = parsedRes.data;
          if (parsed.titleEn) titleEn = parsed.titleEn;
          if (parsed.authors) authors = parsed.authors;
          if (parsed.arxivIdOrDoi) arxivIdOrDoi = parsed.arxivIdOrDoi;
          // Guard against short LLM reconstructions truncating long multi-page PDFs
          if (
            parsed.reconstructedTextWithLatex &&
            parsed.reconstructedTextWithLatex.length > 80 &&
            (rawExtractedText.length < 3500 ||
              parsed.reconstructedTextWithLatex.length >= rawExtractedText.length * 0.65)
          ) {
            enrichedText = parsed.reconstructedTextWithLatex;
            extractionMethod = 'gemini_latex_reconstructed';
          }
        }
      } else if (rawExtractedText.length >= 20) {
        pdfWarning = `已完成本地 PDF 文本提取（${rawExtractedText.length} 字符），但 Gemini 公式还原增强失败（${aiRes.meta.reason || '服务不可用'}）。`;
      }

      // Heuristic title/author extraction from first lines if still generic
      if (rawExtractedText && titleEn === cleanFileNameTitle) {
        const firstLines = rawExtractedText
          .split(/\n+/)
          .map((l) => l.trim())
          .filter((l) => l.length > 5 && !/^arXiv:/i.test(l) && !/^\d+$/.test(l));
        if (firstLines[0] && firstLines[0].length < 180) {
          titleEn = firstLines[0];
        }
        if (!authors && firstLines[1] && firstLines[1].length < 140 && !/abstract/i.test(firstLines[1])) {
          authors = firstLines[1];
        }
      }

      if (!enrichedText || enrichedText.trim().length < 20) {
        res.status(422).json({
          error: `无法从 PDF「${fileName || '未知文件'}」中提取有效文本（扫描版或加密 PDF 需依赖 Gemini 识别，当前失败原因：${aiRes.meta.reason || '未能识别文本'}）。请重试或直接粘贴论文原文。`,
          generationMeta: aiRes.meta,
        });
        return;
      }

      res.json({
        titleEn,
        authors,
        arxivIdOrDoi,
        pageCount,
        extractedText: enrichedText,
        extractionMethod,
        extractionWarning: pdfWarning,
        generationMeta: aiRes.meta,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '解析 PDF 论文失败';
      res.status(500).json({ error: msg });
    }
  });

  // 8. Multi-Turn Context-Aware Gemini Paper Companion Chatbot (Stage 3 Translation & Annotation Manuscript)
  app.post('/api/paper-chat', async (req, res) => {
    try {
      const {
        userMessage,
        chatHistory,
        activeLocation,
        documentContext,
        knowledgeNodes,
        materials,
        annotationDetailLevel,
      } = req.body as {
        userMessage: string;
        chatHistory?: Array<{ role: 'user' | 'assistant'; content: string; locationLabel?: string }>;
        activeLocation: {
          sectionNumber: string;
          sectionTitleZh: string;
          sectionTitleEn: string;
          paragraphId: string;
          paragraphIndex: number;
          statementType: string;
          translatedZhText: string;
          originalEnExcerpt: string;
          equations: Array<{ number: string; latex: string }>;
          focusedAnnotation?: {
            id: string;
            type: string;
            targetConceptZh: string;
            targetConceptEn: string;
            targetEquationOrClause: string;
            whatItIs: string;
            mathOrPhysicalMechanism: string;
          };
          selectedTextSnippet?: string;
        };
        documentContext: {
          titleZh: string;
          titleEn: string;
          authors: string;
          abstractZh: string;
          allSectionTitles: string[];
        };
        knowledgeNodes?: Array<{
          conceptNameZh: string;
          conceptNameEn: string;
          level: string;
          epistemicStatus: string;
        }>;
        materials?: Array<{
          title: string;
          readScope: string;
          parsedScopeSummary?: string;
        }>;
        annotationDetailLevel?: number;
      };
      const detailLevel = normalizeAnnotationDetailLevel(annotationDetailLevel);
      const detailProfile = getAnnotationDetailProfile(detailLevel);

      if (!userMessage || !userMessage.trim()) {
        res.status(400).json({ error: '请输入您想向 Gemini 导师询问的问题。' });
        return;
      }

      const loc = activeLocation || {
        sectionNumber: '1',
        sectionTitleZh: '正文首节',
        sectionTitleEn: 'Section 1',
        paragraphId: 'p-1-1',
        paragraphIndex: 1,
        statementType: '核心论述',
        translatedZhText: '',
        originalEnExcerpt: '',
        equations: [],
      };

      const eqSummary =
        loc.equations && loc.equations.length > 0
          ? loc.equations.map((e) => `公式 (${e.number}): $$${e.latex}$$`).join('\n')
          : '本段无独立编号行间公式';

      const recognizedLocationSummary = [
        `§${loc.sectionNumber}.${loc.paragraphIndex}《${loc.sectionTitleZh}》`,
        loc.equations && loc.equations.length > 0
          ? `公式 (${loc.equations.map((e) => e.number).join(', ')})`
          : null,
        loc.focusedAnnotation ? `批注【${loc.focusedAnnotation.type}｜${loc.focusedAnnotation.targetConceptZh}】` : null,
        loc.selectedTextSnippet ? `划选片段「${loc.selectedTextSnippet.slice(0, 28)}...」` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const k1Concepts = (knowledgeNodes || [])
        .filter((n) => n.level === 'K1')
        .map((n) => n.conceptNameZh)
        .slice(0, 12)
        .join('、');
      const k3k4Concepts = (knowledgeNodes || [])
        .filter((n) => n.level === 'K3' || n.level === 'K4')
        .map((n) => n.conceptNameZh)
        .slice(0, 12)
        .join('、');
      const readBooksSummary = (materials || [])
        .map((m) => `《${m.title}》（已读：${m.readScope}）`)
        .join('；');

      const systemInstruction = `你是一名专业的理论物理研究者、学术翻译专家与 AI 论文精读对话助手。
用户正在精读论文《${documentContext?.titleZh || '理论物理论文'}》（Original Title: ${documentContext?.titleEn || ''}，作者：${documentContext?.authors || ''}），并与你进行自由对话或询问文中某句话的具体含义。

【当前阅读上下文与选中句子】
- 当前所在章节与段落：第 ${loc.sectionNumber} 节《${loc.sectionTitleZh}》(${loc.sectionTitleEn}) · 第 ${loc.paragraphIndex} 段（逻辑属性：${loc.statementType}）
- 当前段落中文译文：
  """
  ${loc.translatedZhText}
  """
- 当前段落英文原文：
  """
  ${loc.originalEnExcerpt}
  """
- 当前段落包含的数学公式：
  ${eqSummary}
${
  loc.selectedTextSnippet
    ? `- 用户当前选中/引用的具体句子或片段：「${loc.selectedTextSnippet}」`
    : ''
}
- 用户知识背景（K1–K4）：已读教材（${readBooksSummary || '用户已配置教材'}）；已掌握 K1 基础（${k1Concepts || '基础微积分、线性代数与常规变分法'}）；需重点衔接拆解的 K3/K4 概念（${k3k4Concepts || '高阶场论与论文原创推导'}）。

【对话与解答原则】
1. **当用户询问某句话的意思（或引用了具体句子「${loc.selectedTextSnippet || '...'}」）时**：
   - 直接用清晰易懂的中文讲清楚这句话的**字面意思与深层物理/数学含义**；
   - 对照英文原文（${loc.originalEnExcerpt ? '见上文英文原文' : ''}）拆解句中的关键专业表述、隐含物理假设或省略的逻辑跳步；
   - 说明这句话在当前段落论证链条中的承上启下作用。
2. **当用户进行自由提问或多轮追问时**：
   - 自然、直接地回应用户的真实问题，像一位耐心且精通理论物理的合作者与用户深入交流，无需机械套用固定八股格式；
   - 涉及数学公式与推导时，行内公式用 $...$，独立公式用 $$...$$，并区分作者【原文推导】与你补充的【补充推导】步骤。

${buildGeminiAnnotationDetailDirective(detailLevel, 'chat')}`;

      // Format recent conversation history into a structured transcript to avoid multi-turn role-alternation 400 errors
      const recentHistoryLines = (chatHistory || [])
        .filter((turn) => turn && turn.content && turn.content.trim() && !turn.content.startsWith('您好！我是您的'))
        .slice(-8)
        .map((turn) => {
          const speaker = turn.role === 'user' ? '用户' : 'AI 助手';
          const locPrefix = turn.locationLabel ? `（${turn.locationLabel}）` : '';
          return `【${speaker}${locPrefix}】：${turn.content.trim()}`;
        });

      const historyBlock =
        recentHistoryLines.length > 0
          ? `【近期多轮对话上下文】：\n${recentHistoryLines.join('\n\n')}\n\n`
          : '';

      const selectedSentenceBlock = loc.selectedTextSnippet
        ? `【用户当前选中/引用的句子】：「${loc.selectedTextSnippet}」\n`
        : '';

      const combinedPrompt = `${historyBlock}【当前阅读段落】：${recognizedLocationSummary}\n${selectedSentenceBlock}【用户提问】：${userMessage.trim()}\n\n请直接针对用户的提问（及所选中的句子）给出清晰、自然、准确的中文解答（行内公式用 $...$，独立公式用 $$...$$）：`;

      const chatRes = await generateWithCascadeDetailed(combinedPrompt, {
        systemInstruction,
        timeoutMs: 45000,
      });

      const finalReplyMarkdown =
        chatRes.text ||
        `▲ **Gemini 伴读响应降级（${chatRes.meta.reason || '模型暂不可用'}）**\n\n` +
          `已锁定您的阅读位置锚点：**${recognizedLocationSummary}**（全局批注详略：Lv.${detailLevel} ${detailProfile.shortLabel}）。\n\n` +
          (loc.selectedTextSnippet
            ? `> 划选内容：「${loc.selectedTextSnippet}」\n\n`
            : '') +
          (loc.equations && loc.equations.length > 0
            ? `本段核心公式 **(${loc.equations[0].number})**：\n$$${loc.equations[0].latex}$$\n\n`
            : '') +
          `当前未能收到实时模型回复，未生成臆测性物理推导。请点击下方「重新向 Gemini 提问」按钮重试您的问题：「${userMessage.trim()}」。`;

      const targetConceptName = loc.selectedTextSnippet
        ? loc.selectedTextSnippet.slice(0, 22)
        : loc.focusedAnnotation?.targetConceptZh ||
          `${loc.sectionTitleZh} (§${loc.sectionNumber}.${loc.paragraphIndex}) 关键推导`;

      res.json({
        replyMarkdown: finalReplyMarkdown,
        recognizedLocationSummary,
        generationMeta: chatRes.meta,
        suggestedAnnotation: chatRes.meta.degraded
          ? undefined
          : {
              id: `ann-chat-${Date.now()}`,
              type: '数学推导',
              targetConceptZh: targetConceptName,
              targetConceptEn: loc.sectionTitleEn || 'Contextual Derivation Inquiry',
              targetEquationOrClause:
                loc.equations && loc.equations.length > 0
                  ? `公式 (${loc.equations[0].number}) 及 §${loc.sectionNumber}.${loc.paragraphIndex}`
                  : `§${loc.sectionNumber}.${loc.paragraphIndex} 第 ${loc.paragraphIndex} 段`,
              knowledgeLevelTag: 'K3',
              derivationAuthenticity: '补充推导',
              verificationStatus: '已核验',
              whatItIs: `针对用户在 ${recognizedLocationSummary} 提问「${userMessage}」生成的伴读导师深度解析。`,
              whyHereAndRole: `直接解答 §${loc.sectionNumber}.${loc.paragraphIndex} 中的阅读障碍，衔接已掌握的 K1 数学工具。`,
              mathOrPhysicalMechanism: finalReplyMarkdown.replace(/^📍.*?\n\n/, ''),
            },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gemini 伴读导师响应异常';
      res.status(500).json({ error: msg });
    }
  });

  // 10. Term-Linked arXiv Background Supplement Search Endpoint
  app.post('/api/arxiv-term-search', async (req, res) => {
    try {
      const { termZh, termEn, excludeArxivId, paperTitleZh, knowledgeLevel } = req.body as {
        termZh?: string;
        termEn?: string;
        excludeArxivId?: string;
        paperTitleZh?: string;
        knowledgeLevel?: string;
      };

      const cleanEn = (termEn || '').trim();
      const cleanZh = (termZh || '').trim();
      const searchSeed = cleanEn || cleanZh;

      if (!searchSeed) {
        res.status(400).json({ error: '请提供需要检索 arXiv 关联论文的物理术语。' });
        return;
      }

      const fetchArxivXml = async (searchQueryExpr: string, maxResults = 8): Promise<ArxivRelatedPaper[]> => {
        try {
          const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(
            searchQueryExpr
          )}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return [];
          const xml = await resp.text();
          return parseArxivAtomXml(xml, { excludeArxivId, limit: 6 });
        } catch {
          return [];
        }
      };

      let papers: ArxivRelatedPaper[] = [];
      if (cleanEn.length >= 2) {
        const quoted = `"${cleanEn.replace(/"/g, '')}"`;
        papers = await fetchArxivXml(`ti:${quoted} OR abs:${quoted}`, 8);
      }

      if (papers.length < 2) {
        const fallbackExpr = `all:${searchSeed}`;
        const broader = await fetchArxivXml(fallbackExpr, 8);
        const existingIds = new Set(papers.map((p) => p.arxivId));
        for (const p of broader) {
          if (!existingIds.has(p.arxivId)) {
            papers.push(p);
            existingIds.add(p.arxivId);
          }
          if (papers.length >= 6) break;
        }
      }

      let backgroundGuideZh = '';
      let termGuideMeta: GenerationMeta = buildSuccessMeta('arxiv-only');
      if (papers.length > 0) {
        const paperListContext = papers
          .slice(0, 4)
          .map(
            (p, idx) =>
              `${idx + 1}. [${p.arxivId}] ${p.title} (${p.primaryCategory}, ${p.publishedDate}) — ${p.abstractSummary.slice(0, 220)}`
          )
          .join('\n');

        const guidePrompt = `你是一名理论物理研究导师。用户正在精读论文《${paperTitleZh || '当前理论物理论文'}》，点击了术语词云中的「${cleanZh}（${cleanEn}）」（知识层级：${knowledgeLevel || '未知'}），检索到以下 arXiv 关联论文：
${paperListContext}

请用精炼的中文学术语言（2-3句话，不超过 180 字）说明这组 arXiv 论文如何作为背景补充，帮助读者更好理解「${cleanZh}」在当前论文中的物理背景与拓展脉络。`;

        const aiGuideRes = await generateWithCascadeDetailed(guidePrompt);
        backgroundGuideZh = aiGuideRes.text || '';
        termGuideMeta = aiGuideRes.meta;
      }

      if (!backgroundGuideZh) {
        backgroundGuideZh =
          papers.length > 0
            ? `已从 arXiv 官方库实时检索到 ${papers.length} 篇围绕「${cleanZh}（${cleanEn}）」展开的相关研究与综述论文，可作为理解当前论文核心方法与物理背景的延伸阅读。`
            : `暂未在 arXiv 即时接口中命中更多独立条目，您可通过下方 arXiv 官方检索链接进一步扩展检索「${cleanEn || cleanZh}」。`;
      }

      res.json({
        termZh: cleanZh,
        termEn: cleanEn,
        searchQueryUsed: cleanEn || cleanZh,
        backgroundGuideZh,
        papers,
        generationMeta: termGuideMeta,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'arXiv 术语关联检索失败';
      res.status(500).json({ error: msg });
    }
  });

  // 11. Mathematical Derivation Mind Map Generation Endpoint
  app.post('/api/derivation-mindmap', async (req, res) => {
    try {
      const {
        paperTitleZh,
        sectionNumber,
        sectionTitleZh,
        paragraph,
        knowledgeNodes = [],
        annotationDetailLevel,
      } = req.body as {
        paperTitleZh?: string;
        sectionNumber?: string;
        sectionTitleZh?: string;
        paragraph?: any;
        knowledgeNodes?: Array<{
          conceptNameZh: string;
          conceptNameEn: string;
          level: string;
        }>;
        annotationDetailLevel?: number;
      };

      if (!paragraph || !paragraph.id) {
        res.status(400).json({ error: '缺少用于生成推导思维导图的段落与公式数据。' });
        return;
      }

      const detailLevel = normalizeAnnotationDetailLevel(annotationDetailLevel);
      const secNum = sectionNumber || '1';
      const secTitle = sectionTitleZh || '核心理论推导';
      const fallbackTree = buildDeterministicDerivationMindMap(
        paragraph,
        secNum,
        secTitle,
        detailLevel
      );

      const k1List = knowledgeNodes
        .filter((n) => n.level === 'K1')
        .slice(0, 12)
        .map((n) => n.conceptNameZh)
        .join('、');
      const k3k4List = knowledgeNodes
        .filter((n) => n.level === 'K3' || n.level === 'K4')
        .slice(0, 12)
        .map((n) => n.conceptNameZh)
        .join('、');

      const equationsText = Array.isArray(paragraph.equations)
        ? paragraph.equations
            .map((e: { number: string; latex: string }) => `公式 (${e.number}): ${e.latex}`)
            .join('\n')
        : '';

      const prompt = `你是一名理论物理研究导师。请针对论文《${paperTitleZh || '当前理论物理论文'}》中 §${secNum}.${paragraph.paragraphIndex}《${secTitle}》的复杂公式，生成一份**树状数学推导思维导图**（严格 JSON 格式）。

【段落译文】：
${paragraph.translatedZhText || ''}

【英文原文片段】：
${paragraph.originalEnExcerpt || ''}

【段落公式】：
${equationsText || fallbackTree.targetFormulaLatex || '见段内公式'}

【读者知识背景】：
- K1 已掌握基础（无需冗余拆解简单代数）：${k1List || '常规微积分与量子力学基础'}
- K3/K4 陌生或论文原创重点（必须展开中间推导步骤）：${k3k4List || '非微扰/场论高阶推导'}

${buildGeminiAnnotationDetailDirective(detailLevel, 'mindmap')}

请返回严格的 JSON 对象（不要使用 markdown 代码块包裹，直接输出 JSON），结构如下：
{
  "equationLabel": "${fallbackTree.equationLabel}",
  "targetFormulaLatex": "核心目标公式的纯 LaTeX（不含 $$）",
  "summaryZh": "一句话概括该公式从前提至结论的推导逻辑主线",
  "root": {
    "id": "root",
    "title": "目标公式与核心待证结论",
    "nodeKind": "target",
    "sourceTag": "原文推导",
    "formulaLatex": "目标公式 LaTeX",
    "explanationZh": "说明该公式在全文中的目标与物理含义",
    "children": [
      {
        "id": "branch-1",
        "title": "一、前置假设与数学基础",
        "nodeKind": "premise",
        "explanationZh": "列出关键场量定义、边界条件与所依赖的数学定理",
        "children": [
          {
            "id": "branch-1-1",
            "title": "具体前提节点",
            "nodeKind": "premise",
            "sourceTag": "原文推导",
            "formulaLatex": "可选前提公式 LaTeX",
            "explanationZh": "详细解释"
          }
        ]
      },
      {
        "id": "branch-2",
        "title": "二、核心推导链路（逐层展开被省略步骤）",
        "nodeKind": "transform",
        "explanationZh": "说明如何从前提变形得到目标公式",
        "children": [
          {
            "id": "branch-2-1",
            "title": "步骤 1：...",
            "nodeKind": "transform",
            "sourceTag": "原文推导",
            "formulaLatex": "中间表达式 LaTeX",
            "explanationZh": "步骤说明"
          },
          {
            "id": "branch-2-2",
            "title": "步骤 2：补充被省略的中间代数/微扰近似",
            "nodeKind": "approximation",
            "sourceTag": "补充推导",
            "formulaLatex": "补充中间式 LaTeX",
            "explanationZh": "详细补全作者跳过的步骤"
          }
        ]
      },
      {
        "id": "branch-3",
        "title": "三、成立条件、量纲核验与物理结论",
        "nodeKind": "verification",
        "explanationZh": "独立检验适用极限与最终物理推论",
        "children": [
          {
            "id": "branch-3-1",
            "title": "极限与量纲核验",
            "nodeKind": "verification",
            "sourceTag": "独立核验",
            "explanationZh": "核验弱耦合/渐近极限与边界项消去条件"
          }
        ]
      }
    ]
  }
}

要求：
1. nodeKind 只能取 "target" | "premise" | "transform" | "approximation" | "verification" | "conclusion"；
2. sourceTag 只能取 "原文推导" | "补充推导" | "独立核验"；
3. 严禁虚构论文中没有的物理参数，确保每个公式 LaTeX 语法合法；
4. 在关键节点尽量提供 2-4 个可折叠的子步骤（children），形成清晰的多层树状结构。`;

      let finalTree = fallbackTree;
      const mindMapRes = await generateWithCascadeDetailed(prompt, { jsonMode: true });
      let effectiveMeta = mindMapRes.meta;

      if (mindMapRes.text) {
        const parsedRes = cleanAndParseJson<Record<string, unknown>>(mindMapRes.text);
        if (parsedRes.ok) {
          finalTree = normalizeDerivationMindMapTree(parsedRes.data, fallbackTree);
        } else {
          effectiveMeta = buildDegradedMeta('PARSE_ERROR', parsedRes.error, true);
          finalTree = fallbackTree;
        }
      }

      res.json({
        mindMap: {
          ...finalTree,
          generationMeta: effectiveMeta,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '生成数学推导思维导图失败';
      res.status(500).json({ error: msg });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const isProductionRuntime =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE) ||
    (process.env.npm_lifecycle_event === 'start' && fs.existsSync(distIndexHtml));

  if (!isProductionRuntime) {
    process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  sheetsMap.delete(id);
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PhysicaAnnotate server running at http://localhost:${PORT}`);
  });
}

startServer();

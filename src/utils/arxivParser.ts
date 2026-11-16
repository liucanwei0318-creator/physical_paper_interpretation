export interface ArxivRelatedPaper {
  arxivId: string;
  title: string;
  authors: string[];
  publishedDate: string;
  primaryCategory: string;
  abstractSummary: string;
  absUrl: string;
  pdfUrl: string;
}

/**
 * Extracts normalized bare arXiv identifier (e.g. "2405.12345" or "hep-th/0603001")
 * stripping version suffix vN and URL/prefix noise for reliable deduplication.
 */
export function normalizeArxivIdentifier(raw: string | undefined | null): string {
  if (!raw) return '';
  const match = raw.match(/(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(?:v\d+)?/i);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Extracts a clean DOI identifier (e.g. "10.1002/cplx.20171" or "10.1103/PhysRevLett.104.170602")
 * from a user query, URL, or citation string.
 */
export function extractDoiFromQuery(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
  if (!match) return null;
  return match[1].replace(/[.,;)\]]+$/, '');
}

const PRESERVED_COMPOUND_PREFIXES = new Set([
  'non',
  'self',
  'quasi',
  'semi',
  'multi',
  'inter',
  'intra',
  'sub',
  'super',
  'anti',
  'co',
  're',
  'pre',
  'post',
  'over',
  'under',
  'one',
  'two',
  'three',
  'four',
  'five',
  'many',
  'few',
  'single',
  'double',
  'first',
  'second',
  'third',
  'high',
  'low',
  'long',
  'short',
  'time',
  'space',
  'free',
  'steady',
  'cross',
  'zero',
  'finite',
  'infinite',
  'well',
  'ill',
  'half',
  'full',
  'all',
]);

/**
 * Repairs legacy two-column PDF text extraction artifacts common in APS (PhysRevLett/PhysRevE)
 * and Wiley/Elsevier PostScript Type-1 fonts:
 * 1. Rejoins words split across lines with a hyphen (e.g. "intro-\nduced" -> "introduced") while
 *    preserving genuine hyphenated compounds (e.g. "non-\nequilibrium" -> "non-equilibrium").
 * 2. Restores APS MathPi/Symbol glyph substitutions:
 *    - "¼" used as "=" in equations (e.g. "f(x) ¼ −∇U" -> "f(x) = −∇U")
 *    - "þ" used as "+" in equations (e.g. "x þ y" -> "x + y")
 *    - "ð...Þ" used as "(...)" in equations/citations (e.g. "fðxÞ" -> "f(x)", "Eq. ð1Þ" -> "Eq. (1)")
 * 3. Expands Latin typographic ligatures (ﬁ, ﬂ, ﬀ, ﬃ, ﬄ).
 */
export function normalizeExtractedPdfText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\u00AD/g, '');

  // Restore APS PostScript math parenthesis glyphs ð ... Þ -> ( ... )
  text = text.replace(/ð([^ðÞ\n]{1,80})Þ/g, '($1)');

  // Restore APS PostScript "=" encoded as "¼" in mathematical expressions
  text = text
    .replace(/(\S)\s+¼\s+(?!of\b|wave\b|plate\b)(\S)/gi, '$1 = $2')
    .replace(/([A-Za-z)\]}∇∂α-ωΑ-Ω])\s*¼\s*([−\-+A-Za-z0-9(\[{∇∂α-ωΑ-Ω\\])/g, '$1 = $2');

  // Restore APS PostScript "+" encoded as "þ" when surrounded by spaces or math tokens
  text = text.replace(/([A-Za-z0-9)\]}∇∂α-ωΑ-Ω'_*])\s+þ\s+([−\-+A-Za-z0-9(\[{∇∂α-ωΑ-Ω\\])/g, '$1 + $2');

  // Rejoin line-break hyphenated words (e.g., "intro-\nduced" -> "introduced", "non-\nequilibrium" -> "non-equilibrium")
  text = text.replace(/([A-Za-z]{2,})-\s*\n\s*([a-z]{2,})/g, (_match, left: string, right: string) => {
    if (PRESERVED_COMPOUND_PREFIXES.has(left.toLowerCase()) || /^[A-Z]/.test(left) && left.length <= 4) {
      return `${left}-${right}`;
    }
    return `${left}${right}`;
  });

  // Also rejoin inline column-wrap hyphenation when a common word stem is split with "- " mid-line
  text = text.replace(
    /\b(intro|poten|mea|stochas|fluctu|equi|general|thermo|tempera|partic|experi|differ|distri|approx|calcula|simula|observ|contrib|propor|veloci|positi|dimen|relat|configu|depend|magni|func|sec|equa)-\s+(duced|tial|tials|surement|surements|tic|ation|ations|librium|ized|dynamic|dynamics|ture|cles|mental|ential|bution|imately|tion|tions|lations|tional|ties|sional|uration|ent|tude|нда)/gi,
    '$1$2'
  );

  return text;
}

/**
 * Parses arXiv Atom API XML response into structured paper records with
 * category, publication month, authors, abstract, abs URL, and PDF URL.
 */
export function parseArxivAtomXml(
  xml: string,
  options: { excludeArxivId?: string; limit?: number } = {}
): ArxivRelatedPaper[] {
  if (!xml || typeof xml !== 'string') return [];

  const excludeNorm = normalizeArxivIdentifier(options.excludeArxivId);
  const limit = options.limit ?? 6;
  const entries = xml.split('<entry>').slice(1);
  const results: ArxivRelatedPaper[] = [];

  for (const entry of entries) {
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
    if (!titleMatch || !idMatch) continue;

    const rawIdUrl = idMatch[1].trim().replace('http://', 'https://');
    const idExtract = rawIdUrl.match(/abs\/(.+)$/i);
    const arxivId = idExtract ? idExtract[1].trim() : rawIdUrl;

    if (excludeNorm && normalizeArxivIdentifier(arxivId) === excludeNorm) {
      continue;
    }

    const cleanTitle = titleMatch[1].replace(/\s+/g, ' ').trim();
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const cleanSummary = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';

    const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
    const publishedDate = publishedMatch ? publishedMatch[1].trim().slice(0, 7) : '';

    const primaryCatMatch =
      entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/i) ||
      entry.match(/<category[^>]*term="([^"]+)"/i);
    const primaryCategory = primaryCatMatch ? primaryCatMatch[1].trim() : 'physics';

    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);

    const absUrl = rawIdUrl.includes('/abs/')
      ? rawIdUrl
      : `https://arxiv.org/abs/${arxivId}`;
    const pdfUrl = absUrl.replace('/abs/', '/pdf/');

    results.push({
      arxivId,
      title: cleanTitle,
      authors,
      publishedDate,
      primaryCategory,
      abstractSummary: cleanSummary,
      absUrl,
      pdfUrl,
    });

    if (results.length >= limit) break;
  }

  return results;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Extracts structured academic text from ar5iv HTML while:
 * 1. Converting <table class="ltx_equation / ltx_eqn_table"> into standalone $$...$$ display math blocks
 * 2. Converting inline <math alttext="..."> into $...$ inline math
 * 3. Preserving section headings (h2/h3.ltx_title) with explicit "## " Markdown markers
 * 4. Stripping bibliography, acknowledgments, and duplicate abstract blocks
 */
export function extractStructuredTextFromAr5ivHtml(
  html: string,
  fallbackAbstract: string = ''
): string {
  if (!html || typeof html !== 'string') return '';

  // 1. Remove non-body noise, bibliography, and acknowledgments sections
  let cleaned = html
    .replace(/<(?:script|style|nav|header|footer)[^>]*>[\s\S]*?<\/(?:script|style|nav|header|footer)>/gi, ' ')
    .replace(/<section[^>]*class="[^"]*ltx_(?:bibliography|acknowledgements?)[^"]*"[^>]*>[\s\S]*?<\/section>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*ltx_(?:bibliography|acknowledgement|dates)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ');

  // 2. Convert display equation tables (<table class="ltx_equation..."> or <table class="ltx_eqn_table...">)
  // into <p class="ltx_p">$$ ... $$</p> so they are captured in document order as display equations
  cleaned = cleaned.replace(
    /<table[^>]*class="[^"]*ltx_eq(?:uation|n)[^"]*"[^>]*>([\s\S]*?)<\/table>/gi,
    (_tableMatch, tableInner: string) => {
      const mathAlts = [...tableInner.matchAll(/<math[^>]*alttext="([^"]+)"[^>]*>[\s\S]*?<\/math>/gi)]
        .map((m) => decodeHtmlEntities(m[1]).trim())
        .filter(Boolean);
      if (mathAlts.length === 0) return ' ';
      const combinedLatex = mathAlts
        .join(' ')
        .replace(/^\\\[|\\\]$/g, '')
        .replace(/^\$\$|\$\$$/g, '')
        .trim();
      return `<p class="ltx_p">\n\n$$${combinedLatex}$$\n\n</p>`;
    }
  );

  // 3. Convert remaining inline <math alttext="..."> into $...$
  cleaned = cleaned.replace(
    /<math[^>]*alttext="([^"]+)"[^>]*>[\s\S]*?<\/math>/gi,
    (_m, alt: string) => {
      const decoded = decodeHtmlEntities(alt).trim();
      return decoded ? ` $${decoded}$ ` : ' ';
    }
  );

  // 4. Extract headings (h2/h3/h4/h6 with ltx_title) and paragraphs (p with ltx_p / ltx_para) in document order
  const blockMatches = [
    ...cleaned.matchAll(
      /<(h[1-6]|p)[^>]*class="[^"]*ltx_(?:title|para|p)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi
    ),
  ];

  const blocks: string[] = [];
  const normAbstractPrefix = fallbackAbstract
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 80);

  let skipCurrentSection = false;

  for (const match of blockMatches.slice(0, 520)) {
    const tag = match[1].toLowerCase();
    const rawInner = decodeHtmlEntities(
      match[2]
        .replace(/<span[^>]*class="[^"]*ltx_tag_section[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1 ')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!rawInner) continue;

    if (tag.startsWith('h')) {
      if (/^(?:abstract|摘要)$/i.test(rawInner)) {
        continue;
      }
      if (/^(?:acknowledg(?:e)?ments?|references|bibliography|funding)\b/i.test(rawInner)) {
        skipCurrentSection = true;
        continue;
      }
      skipCurrentSection = false;
      blocks.push(`## ${rawInner}`);
      continue;
    }

    if (skipCurrentSection) continue;

    // Skip duplicate abstract paragraph if fallbackAbstract will already be prepended
    if (normAbstractPrefix.length >= 30 && blocks.length <= 2) {
      const normBlock = rawInner
        .replace(/^abstract[:.\s]*/i, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      if (normBlock.startsWith(normAbstractPrefix.slice(0, 45))) {
        continue;
      }
    }

    if (rawInner.length > 8 || rawInner.includes('$$')) {
      blocks.push(rawInner);
    }
  }

  return blocks.join('\n\n').trim();
}


/**
 * Defensive URL and external-identifier validation helpers.
 * Prevents DOM-based XSS (javascript:/data:/vbscript: schemes),
 * open redirects, and SSRF / path-injection when constructing upstream URLs.
 */

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

/**
 * Validates an untrusted external URL before binding it to `<a href>` or returning it from APIs.
 * Only allows absolute `https:` and `http:` URLs without control characters or embedded credentials.
 */
export function sanitizeExternalUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048 || CONTROL_CHAR_REGEX.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const STRICT_ARXIV_ID_REGEX =
  /^(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[a-z-]+)?\/\d{7}(?:v\d+)?)$/i;

/**
 * Strictly extracts and validates a canonical arXiv identifier
 * (modern `YYMM.NNNNN[vN]` or legacy `archive/YYMMNNN[vN]`).
 * Rejects path traversal (`..`), query strings, fragments, and arbitrary hosts.
 */
export function validateStrictArxivId(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 160 || CONTROL_CHAR_REGEX.test(trimmed)) {
    return null;
  }

  // Strip known arXiv prefixes or official arxiv.org / ar5iv URL prefixes
  let candidate = trimmed
    .replace(/^https?:\/\/(?:ar5iv\.labs\.|export\.)?arxiv\.org\/(?:abs|pdf|html)\//i, '')
    .replace(/^arxiv:\s*/i, '')
    .replace(/\.pdf$/i, '')
    .trim();

  // Reject any leftover query, fragment, backslash, whitespace, or traversal segments
  if (/[?#\\@\s]/.test(candidate) || candidate.includes('..')) {
    return null;
  }

  const match = candidate.match(STRICT_ARXIV_ID_REGEX);
  return match ? match[1] : null;
}

const OPEN_LIBRARY_EDITION_KEY_REGEX = /^OL[0-9A-Za-z]{1,20}M$/;
const OPEN_LIBRARY_PATH_REGEX = /^\/(?:works|books|authors)\/[A-Za-z0-9_-]{1,40}$/;

/**
 * Validates an OpenLibrary edition identifier (e.g. `OL123456M`) before interpolating into API queries.
 */
export function validateOpenLibraryEditionKey(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return OPEN_LIBRARY_EDITION_KEY_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Validates an OpenLibrary relative path (e.g. `/works/OL12345W`) to prevent protocol-relative open redirects.
 */
export function validateOpenLibraryPath(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return OPEN_LIBRARY_PATH_REGEX.test(trimmed) ? trimmed : null;
}

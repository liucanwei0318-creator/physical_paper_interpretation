import type { GenerationErrorCode, GenerationMeta } from '../types/physics.ts';

/**
 * Supported, active Gemini models aligned with current @google/genai guidance.
 * Never includes deprecated gemini-2.0-* / gemini-1.5-* models.
 */
export const SUPPORTED_GEMINI_TEXT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

export interface ClassifiedGeminiError {
  errorCode: GenerationErrorCode;
  reasonZh: string;
  retryable: boolean;
}

export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : JSON.stringify(err ?? '');
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return {
      errorCode: 'RATE_LIMIT_429',
      reasonZh: 'Gemini API 请求配额或并发频率已达上限 (429)，请稍候片刻后点击重试。',
      retryable: true,
    };
  }

  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated') ||
    lower.includes('api key not valid')
  ) {
    return {
      errorCode: 'AUTH_ERROR',
      reasonZh: 'Gemini API 密钥无效或权限不足 (401/403)，请检查服务端 GEMINI_API_KEY 环境变量。',
      retryable: false,
    };
  }

  if (
    lower.includes('timeout') ||
    lower.includes('aborterror') ||
    lower.includes('timeouterror') ||
    lower.includes('etimedout') ||
    lower.includes('deadline_exceeded')
  ) {
    return {
      errorCode: 'TIMEOUT',
      reasonZh: 'Gemini 模型响应超时，建议缩短单次片段或点击重试。',
      retryable: true,
    };
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('enotfound') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('network')
  ) {
    return {
      errorCode: 'NETWORK_ERROR',
      reasonZh: '连接 Gemini 服务端点时发生网络异常，请检查网络连通性后重试。',
      retryable: true,
    };
  }

  const snippet = rawMessage.replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    errorCode: 'UNKNOWN_ERROR',
    reasonZh: snippet
      ? `Gemini 调用异常（${snippet}），可点击重试。`
      : 'Gemini 调用返回未知异常，请稍后重试。',
    retryable: true,
  };
}

/**
 * Repairs common JSON syntax errors produced by LLMs when outputting LaTeX-heavy physics JSON:
 * 1. Unescaped LaTeX backslashes inside JSON strings (e.g. \frac, \rho, \nabla, \beta, \tau, \alpha, \mathrm, \, etc.)
 * 2. Raw unescaped newlines/tabs inside JSON string literals
 * 3. Trailing commas before } or ]
 */
export function repairLatexJsonString(raw: string): string {
  const LATEX_BFNRT_PREFIX =
    /^(?:frac|forall|flat|fbox|beta|bar|bf|binom|big|Big|bigg|Bigg|bigcup|bigcap|bigoplus|bigotimes|bot|bullet|nabla|nu|neq|ne|ni|not|notin|natural|neg|nolimits|normalsize|rho|right|rightarrow|Rightarrow|leftrightarrow|Leftrightarrow|rangle|rceil|rfloor|rm|Re|tau|theta|vartheta|tilde|widetilde|times|to|top|triangle|triangleq|text|textrm|textbf|textit|texttt|tfrac|tanh|tan|trg)(?:[^a-zA-Z]|$)/;

  let out = '';
  let inString = false;
  const len = raw.length;

  for (let i = 0; i < len; i++) {
    const ch = raw[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
      continue;
    }

    // Inside a JSON string literal
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      out += '\\r';
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }

    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === undefined) {
        out += '\\\\';
        continue;
      }

      // Already doubled backslash \\ -> keep both and advance
      if (next === '\\') {
        out += '\\\\';
        i++;
        continue;
      }

      // Escaped quote or slash \" or \/
      if (next === '"' || next === '/') {
        out += '\\' + next;
        i++;
        continue;
      }

      // Valid unicode escape \uXXXX
      if (next === 'u' && /^[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
        out += raw.slice(i, i + 6);
        i += 5;
        continue;
      }

      // Ambiguous JSON control escapes (\b, \f, \n, \r, \t) that might actually be LaTeX (\frac, \beta, \nabla, \rho, \tau, \theta, \text, \times, \to)
      if (next === 'b' || next === 'f' || next === 'n' || next === 'r' || next === 't') {
        const restAfterSlash = raw.slice(i + 1, i + 18);
        if (LATEX_BFNRT_PREFIX.test(restAfterSlash)) {
          out += '\\\\';
          continue;
        }
        out += '\\' + next;
        i++;
        continue;
      }

      // Any other \X (e.g. \alpha, \gamma, \delta, \mathrm, \mathcal, \left, \ln, \sum, \int, \_, \{, \}, \, etc.)
      // is an invalid JSON escape sequence and must be doubled to \\X
      out += '\\\\';
      continue;
    }

    out += ch;
  }

  // Also strip trailing commas outside strings before } or ]
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Strips markdown code fences and extracts the outermost JSON object or array safely,
 * automatically repairing unescaped LaTeX backslashes if initial JSON.parse fails.
 */
export function cleanAndParseJson<T>(rawText: string): { ok: true; data: T } | { ok: false; error: string } {
  if (!rawText || !rawText.trim()) {
    return { ok: false, error: '模型返回为空字符串' };
  }

  const stripped = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const tryParse = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      try {
        return JSON.parse(repairLatexJsonString(candidate)) as T;
      } catch {
        return null;
      }
    }
  };

  const direct = tryParse(stripped);
  if (direct !== null) {
    return { ok: true, data: direct };
  }

  const firstObj = stripped.indexOf('{');
  const lastObj = stripped.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) {
    const slicedObj = tryParse(stripped.slice(firstObj, lastObj + 1));
    if (slicedObj !== null) {
      return { ok: true, data: slicedObj };
    }
  }

  const firstArr = stripped.indexOf('[');
  const lastArr = stripped.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    const slicedArr = tryParse(stripped.slice(firstArr, lastArr + 1));
    if (slicedArr !== null) {
      return { ok: true, data: slicedArr };
    }
  }

  return { ok: false, error: '模型输出 JSON 不完整或格式损坏（可能因单次响应过长被截断）' };
}

export function buildDegradedMeta(
  errorCode: GenerationErrorCode,
  reason: string,
  retryable: boolean = true
): GenerationMeta {
  return {
    degraded: true,
    sourceMode: 'deterministic_fallback',
    errorCode,
    reason,
    retryable,
    timestamp: new Date().toISOString(),
  };
}

export function buildSuccessMeta(modelUsed: string): GenerationMeta {
  return {
    degraded: false,
    sourceMode: 'gemini',
    modelUsed,
    retryable: false,
    timestamp: new Date().toISOString(),
  };
}

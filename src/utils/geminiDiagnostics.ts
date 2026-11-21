import type {
  GenerationErrorCode,
  GenerationMeta,
  SelectableGeminiModel,
  ModelRoutingMode,
  ModelConnectivityProbeResult,
} from '../types/physics.ts';

/**
 * Supported, active Gemini models aligned with current @google/genai guidance.
 * Never includes deprecated gemini-2.0-* / gemini-1.5-* models.
 */
export const SUPPORTED_GEMINI_TEXT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-3.1-flash-lite',
] as const;

export function normalizePreferredGeminiModel(input: unknown): SelectableGeminiModel {
  if (
    input === 'gemini-4-hydrogen' ||
    input === 'gemini-4-neon' ||
    input === 'gemini-4-carbon' ||
    input === 'gemini-4-argon' ||
    input === 'gemini-3.1-flash-lite'
  ) {
    return input;
  }
  return 'gemini-4-hydrogen';
}

export function normalizeModelRoutingMode(input: unknown): ModelRoutingMode {
  return input === 'strict' ? 'strict' : 'cascade';
}

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
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      errorCode: 'NETWORK_ERROR',
      reasonZh: 'Google 官方模型节点当前处于高峰拥塞 (503 High Demand)，建议启用智能级联自动切换至 Flash-Lite 或稍后重试。',
      retryable: true,
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

export function isPaidTierGeminiModel(model: SelectableGeminiModel): boolean {
  return (
    model === 'gemini-4-neon' ||
    model === 'gemini-4-carbon' ||
    model === 'gemini-4-argon'
  );
}

export function classifyModelProbeError(
  model: SelectableGeminiModel,
  err: unknown,
  latencyMs: number
): ModelConnectivityProbeResult {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : JSON.stringify(err ?? '');
  const lower = rawMessage.toLowerCase();
  const safeLatency = Math.max(0, Math.round(latencyMs));

  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    const paidModel = isPaidTierGeminiModel(model);
    return {
      model,
      ok: false,
      status: 'paid_or_quota_429',
      statusLabelZh: paidModel ? '429 需付费 Key / 配额受限' : '429 配额已满或限流',
      detailZh: paidModel
        ? 'Google 服务端已识别该模型，但返回 429 RESOURCE_EXHAUSTED：此模型需在 Settings > Secrets 中绑定开启结算（Billing）的付费 API Key。'
        : '当前 API Key 对该模型的免费配额或并发频率已达上限 (429)，请稍后重试或绑定付费 Key。',
      latencyMs: safeLatency,
      httpStatus: 429,
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
      model,
      ok: false,
      status: 'auth_error',
      statusLabelZh: '403 密钥无效或无权限',
      detailZh: '当前 GEMINI_API_KEY 鉴权失败或无权访问该模型，请前往 Settings > Secrets 核对密钥。',
      latencyMs: safeLatency,
      httpStatus: lower.includes('401') ? 401 : 403,
    };
  }

  if (lower.includes('404') || lower.includes('not_found') || lower.includes('not found')) {
    return {
      model,
      ok: false,
      status: 'not_found',
      statusLabelZh: '404 模型不可用',
      detailZh: 'Google API 返回 404 NOT_FOUND，当前区域或账号暂未开放该模型 ID。',
      latencyMs: safeLatency,
      httpStatus: 404,
    };
  }

  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      model,
      ok: false,
      status: 'error',
      statusLabelZh: '503 官方高峰拥塞',
      detailZh:
        'Google 服务端返回 503（当前模型高负载排队，属官方临时拥塞，非密钥配置错误）；建议保持「智能级联」自动回退至 Flash-Lite，或稍后再试。',
      latencyMs: safeLatency,
      httpStatus: 503,
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
      model,
      ok: false,
      status: 'timeout',
      statusLabelZh: `响应超时 (>${(safeLatency / 1000).toFixed(0)}s)`,
      detailZh: '在检测限时内未收到响应（当前时段该模型可能存在排队或长思考延迟），建议启用智能级联模式。',
      latencyMs: safeLatency,
    };
  }

  const snippet = rawMessage.replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    model,
    ok: false,
    status: 'error',
    statusLabelZh: '调用异常',
    detailZh: snippet ? `返回异常：${snippet}` : '连接模型端点失败，请稍后重试。',
    latencyMs: safeLatency,
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

export interface GenerationTelemetry {
  requestedModel?: SelectableGeminiModel;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
}

export function buildDegradedMeta(
  errorCode: GenerationErrorCode,
  reason: string,
  retryable: boolean = true,
  telemetry?: GenerationTelemetry
): GenerationMeta {
  return {
    degraded: true,
    sourceMode: 'deterministic_fallback',
    errorCode,
    reason,
    retryable,
    timestamp: new Date().toISOString(),
    ...telemetry,
  };
}

export function buildSuccessMeta(
  modelUsed: string,
  telemetry?: GenerationTelemetry
): GenerationMeta {
  return {
    degraded: false,
    sourceMode: 'gemini',
    modelUsed,
    retryable: false,
    timestamp: new Date().toISOString(),
    ...telemetry,
  };
}

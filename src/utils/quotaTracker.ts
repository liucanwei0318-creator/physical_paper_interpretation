import type {
  GeminiAccountTier,
  GeminiUsageLogEntry,
  GenerationMeta,
  ModelRoutingMode,
  SelectableGeminiModel,
} from '../types/physics.ts';
import {
  normalizeModelRoutingMode,
  normalizePreferredGeminiModel,
} from './geminiDiagnostics.ts';

export const QUOTA_LEDGER_STORAGE_KEY = 'physica_annotate_quota_ledger_v1';
export const DEFAULT_PREFERRED_GEMINI_MODEL: SelectableGeminiModel = 'gemini-4-hydrogen';
export const DEFAULT_MODEL_ROUTING_MODE: ModelRoutingMode = 'cascade';
export const DEFAULT_GEMINI_ACCOUNT_TIER: GeminiAccountTier = 'free';
export const DEFAULT_DAILY_TOKEN_BUDGET = 500_000;
export const MAX_STORED_USAGE_ENTRIES = 250;

export interface OfficialModelRateLimit {
  rpm: number;
  tpm: number;
  rpd: number;
  tierLabelZh: string;
}

export const GEMINI_OFFICIAL_LIMITS: Record<
  GeminiAccountTier,
  Record<SelectableGeminiModel, OfficialModelRateLimit>
> = {
  free: {
    'gemini-4-hydrogen': {
      rpm: 15,
      tpm: 250_000,
      rpd: 500,
      tierLabelZh: '免费层级 (Free Tier)',
    },
    'gemini-4-argon': {
      rpm: 5,
      tpm: 250_000,
      rpd: 100,
      tierLabelZh: '免费层级 (Free Tier)',
    },
    'gemini-3.1-flash-lite': {
      rpm: 30,
      tpm: 1_000_000,
      rpd: 1_500,
      tierLabelZh: '免费层级 (Free Tier)',
    },
  },
  tier1: {
    'gemini-4-hydrogen': {
      rpm: 1_000,
      tpm: 4_000_000,
      rpd: 10_000,
      tierLabelZh: '付费层级 (Tier 1)',
    },
    'gemini-4-argon': {
      rpm: 150,
      tpm: 2_000_000,
      rpd: 1_000,
      tierLabelZh: '付费层级 (Tier 1)',
    },
    'gemini-3.1-flash-lite': {
      rpm: 4_000,
      tpm: 4_000_000,
      rpd: 10_000,
      tierLabelZh: '付费层级 (Tier 1)',
    },
  },
};

export interface PacificResetCountdown {
  pacificDate: string;
  formattedCountdown: string;
  nextResetBeijingLabel: string;
  msRemaining: number;
}

export interface OfficialModelQuotaStatus {
  model: SelectableGeminiModel;
  shortName: string;
  tier: GeminiAccountTier;
  limits: OfficialModelRateLimit;
  todayRequests: number;
  todayTokens: number;
  lastMinuteRequests: number;
  lastMinuteTokens: number;
  rpdPercent: number;
  rpmPercent: number;
  tpmPercent: number;
}

export interface GeminiModelProfile {
  model: SelectableGeminiModel;
  shortName: string;
  badgeText: string;
  titleZh: string;
  descriptionZh: string;
  speedRating: string;
  reasoningRating: string;
  recommendedForZh: string;
  freeTierWarningZh?: string;
}

export const GEMINI_MODEL_PROFILES: Record<SelectableGeminiModel, GeminiModelProfile> = {
  'gemini-4-hydrogen': {
    model: 'gemini-4-hydrogen',
    shortName: 'Hydrogen',
    badgeText: '推荐主力 · 高速均衡',
    titleZh: 'Gemini 4 Hydrogen (gemini-4-hydrogen)',
    descriptionZh:
      '兼顾理论物理公式推导精度与高吞吐响应速度，适合绝大多数长篇论文分节翻译、全局预分析与知识图谱建模。',
    speedRating: '极快 (Fast)',
    reasoningRating: '高 (High STEM)',
    recommendedForZh: '全文分节翻译、章节预分析、教材范围建模',
  },
  'gemini-4-argon': {
    model: 'gemini-4-argon',
    shortName: 'Argon',
    badgeText: '深度推理旗舰 · 免费层每日仅 100 次',
    titleZh: 'Gemini 4 Argon (gemini-4-argon)',
    descriptionZh:
      '针对复杂张量演算、高阶微扰圈图、全息纠缠熵与数学物理定理证明强化深度推理，适合疑难段落精读与伴读追问。',
    speedRating: '中等 (Deep Reasoning)',
    reasoningRating: '极高 (Flagship Pro)',
    recommendedForZh: '复杂数学推导还原、伴读导师深度追问、公式推导思维导图',
    freeTierWarningZh: '免费层每日仅 100 次 (100 RPD / 5 RPM)，超限易触发 429',
  },
  'gemini-3.1-flash-lite': {
    model: 'gemini-3.1-flash-lite',
    shortName: 'Flash-Lite',
    badgeText: '轻量极速 · 低耗省流',
    titleZh: 'Gemini 3.1 Flash-Lite (gemini-3.1-flash-lite)',
    descriptionZh:
      '高性价比低延迟轻量模型，在保持标准学术术语准确性的同时大幅节省 Token 额度与等待时间。',
    speedRating: '瞬时 (Ultra-Fast)',
    reasoningRating: '标准 (Standard)',
    recommendedForZh: '联网文献检索综述、目录提取、低配额快速浏览',
  },
};

export interface ModelUsageBreakdownItem {
  model: string;
  shortName: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  percentOfTotalTokens: number;
}

export interface StageUsageBreakdownItem {
  stageLabelZh: string;
  calls: number;
  totalTokens: number;
  percentOfTotalTokens: number;
}

export interface QuotaUsageSummary {
  todayDateUtc: string;
  dailyTokenBudget: number;
  todayCalls: number;
  todayDegradedCalls: number;
  todayPromptTokens: number;
  todayCompletionTokens: number;
  todayTotalTokens: number;
  todayBudgetPercent: number;
  avgLatencyMs: number;
  allTimeCalls: number;
  allTimeTotalTokens: number;
  byModel: ModelUsageBreakdownItem[];
  byStage: StageUsageBreakdownItem[];
}

export function estimateTokensFromText(text: string | undefined | null): number {
  if (!text) return 0;
  // Physics LaTeX + Chinese/English academic text averages ~3.2 chars per token
  return Math.max(1, Math.ceil(text.length / 3.2));
}

export function inferStageLabelZhFromEndpoint(endpoint: string): string {
  const clean = (endpoint || '').toLowerCase();
  if (clean.includes('translate-chunk')) return '分节深度翻译与批注';
  if (clean.includes('process-custom-paper')) return '论文全局预分析';
  if (clean.includes('paper-chat')) return 'AI 伴读导师问答';
  if (clean.includes('derivation-mindmap')) return '公式推导思维导图';
  if (clean.includes('deep-dive-query')) return '段落深度追问推导';
  if (clean.includes('generate-knowledge-report')) return '个人知识背景报告';
  if (clean.includes('analyze-material')) return '教材章节掌握度建模';
  if (clean.includes('fetch-book-toc')) return '教材目录智能提取';
  if (clean.includes('web-search')) return '联网文献检索与综述';
  return '学术 AI 辅助任务';
}

export function normalizeUsageLogEntries(raw: unknown): GeminiUsageLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, idx) => {
      const promptTokens =
        typeof item.promptTokens === 'number' && Number.isFinite(item.promptTokens)
          ? Math.max(0, Math.round(item.promptTokens))
          : 0;
      const completionTokens =
        typeof item.completionTokens === 'number' && Number.isFinite(item.completionTokens)
          ? Math.max(0, Math.round(item.completionTokens))
          : 0;
      const totalTokens =
        typeof item.totalTokens === 'number' && Number.isFinite(item.totalTokens)
          ? Math.max(promptTokens + completionTokens, Math.round(item.totalTokens))
          : promptTokens + completionTokens;
      const endpoint = typeof item.endpoint === 'string' ? item.endpoint : '/api/translate-chunk';

      return {
        id: typeof item.id === 'string' && item.id ? item.id : `usage-${Date.now()}-${idx}`,
        timestamp:
          typeof item.timestamp === 'string' && item.timestamp
            ? item.timestamp
            : new Date().toISOString(),
        endpoint,
        stageLabelZh:
          typeof item.stageLabelZh === 'string' && item.stageLabelZh
            ? item.stageLabelZh
            : inferStageLabelZhFromEndpoint(endpoint),
        requestedModel: normalizePreferredGeminiModel(item.requestedModel),
        actualModel:
          typeof item.actualModel === 'string' && item.actualModel
            ? item.actualModel
            : normalizePreferredGeminiModel(item.requestedModel),
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs:
          typeof item.latencyMs === 'number' && Number.isFinite(item.latencyMs)
            ? Math.max(0, Math.round(item.latencyMs))
            : 0,
        degraded: Boolean(item.degraded),
      };
    })
    .slice(0, MAX_STORED_USAGE_ENTRIES);
}

export function computeQuotaSummary(
  entries: GeminiUsageLogEntry[],
  dailyTokenBudgetInput: number = DEFAULT_DAILY_TOKEN_BUDGET,
  nowIso: string = new Date().toISOString()
): QuotaUsageSummary {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const dailyTokenBudget =
    Number.isFinite(dailyTokenBudgetInput) && dailyTokenBudgetInput >= 10_000
      ? Math.round(dailyTokenBudgetInput)
      : DEFAULT_DAILY_TOKEN_BUDGET;
  const todayDateUtc = nowIso.slice(0, 10);

  let todayCalls = 0;
  let todayDegradedCalls = 0;
  let todayPromptTokens = 0;
  let todayCompletionTokens = 0;
  let todayTotalTokens = 0;
  let latencySum = 0;
  let latencyCount = 0;

  let allTimeCalls = 0;
  let allTimeTotalTokens = 0;

  const modelStatsMap = new Map<
    string,
    { calls: number; promptTokens: number; completionTokens: number; totalTokens: number }
  >([
    ['gemini-4-hydrogen', { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }],
    ['gemini-4-argon', { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }],
    ['gemini-3.1-flash-lite', { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }],
  ]);

  const stageStatsMap = new Map<string, { calls: number; totalTokens: number }>();

  for (const e of safeEntries) {
    allTimeCalls += 1;
    allTimeTotalTokens += e.totalTokens;

    const isToday = (e.timestamp || '').slice(0, 10) === todayDateUtc;
    if (isToday) {
      todayCalls += 1;
      if (e.degraded) todayDegradedCalls += 1;
      todayPromptTokens += e.promptTokens;
      todayCompletionTokens += e.completionTokens;
      todayTotalTokens += e.totalTokens;
      if (e.latencyMs > 0) {
        latencySum += e.latencyMs;
        latencyCount += 1;
      }
    }

    const modelKey = e.actualModel || e.requestedModel || 'gemini-4-hydrogen';
    const mStat = modelStatsMap.get(modelKey) || {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    mStat.calls += 1;
    mStat.promptTokens += e.promptTokens;
    mStat.completionTokens += e.completionTokens;
    mStat.totalTokens += e.totalTokens;
    modelStatsMap.set(modelKey, mStat);

    const stageKey = e.stageLabelZh || inferStageLabelZhFromEndpoint(e.endpoint);
    const sStat = stageStatsMap.get(stageKey) || { calls: 0, totalTokens: 0 };
    sStat.calls += 1;
    sStat.totalTokens += e.totalTokens;
    stageStatsMap.set(stageKey, sStat);
  }

  const denomTokens = Math.max(1, allTimeTotalTokens);
  const byModel: ModelUsageBreakdownItem[] = [...modelStatsMap.entries()].map(([model, stat]) => {
    const profile = GEMINI_MODEL_PROFILES[model as SelectableGeminiModel];
    return {
      model,
      shortName: profile ? profile.shortName : model,
      calls: stat.calls,
      promptTokens: stat.promptTokens,
      completionTokens: stat.completionTokens,
      totalTokens: stat.totalTokens,
      percentOfTotalTokens:
        allTimeTotalTokens > 0 ? Math.round((stat.totalTokens / denomTokens) * 100) : 0,
    };
  });

  const byStage: StageUsageBreakdownItem[] = [...stageStatsMap.entries()]
    .map(([stageLabelZh, stat]) => ({
      stageLabelZh,
      calls: stat.calls,
      totalTokens: stat.totalTokens,
      percentOfTotalTokens:
        allTimeTotalTokens > 0 ? Math.round((stat.totalTokens / denomTokens) * 100) : 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const todayBudgetPercent = Math.min(
    100,
    Math.round((todayTotalTokens / Math.max(1, dailyTokenBudget)) * 100)
  );

  return {
    todayDateUtc,
    dailyTokenBudget,
    todayCalls,
    todayDegradedCalls,
    todayPromptTokens,
    todayCompletionTokens,
    todayTotalTokens,
    todayBudgetPercent,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
    allTimeCalls,
    allTimeTotalTokens,
    byModel,
    byStage,
  };
}

export function normalizeGeminiAccountTier(raw: unknown): GeminiAccountTier {
  return raw === 'tier1' ? 'tier1' : 'free';
}

/**
 * Formats a Date or timestamp into YYYY-MM-DD in America/Los_Angeles (Pacific Time),
 * matching Google AI Studio's official RPD daily reset boundary.
 */
export function getPacificDateKey(input: Date | number | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value || '2026';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    return `${y}-${m}-${day}`;
  } catch {
    // Fallback to UTC-8 approximation if ICU timezone unavailable
    return new Date(d.getTime() - 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

function getPacificTimeParts(d: Date): {
  dateKey: string;
  hour: number;
  minute: number;
  second: number;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value || '2026';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0') % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
    const second = Number(parts.find((p) => p.type === 'second')?.value || '0');
    return { dateKey: `${y}-${m}-${day}`, hour, minute, second };
  } catch {
    const approx = new Date(d.getTime() - 8 * 3600 * 1000);
    return {
      dateKey: approx.toISOString().slice(0, 10),
      hour: approx.getUTCHours(),
      minute: approx.getUTCMinutes(),
      second: approx.getUTCSeconds(),
    };
  }
}

/**
 * Computes exact time remaining until the next 00:00 Pacific Time (PT),
 * accurately handling both PST (-08:00) and PDT (-07:00) transitions.
 */
export function computePacificResetCountdown(nowMs: number = Date.now()): PacificResetCountdown {
  const nowDate = new Date(nowMs);
  const ptNow = getPacificTimeParts(nowDate);
  const secondsIntoDay = ptNow.hour * 3600 + ptNow.minute * 60 + ptNow.second;
  // Approximate next midnight PT first, then refine to exact PT 00:00:00 boundary
  let candidateMs = nowMs + (86400 - secondsIntoDay) * 1000;
  // Step minute-level drift if DST transition crosses 23h or 25h day
  for (let i = 0; i < 3; i++) {
    const check = getPacificTimeParts(new Date(candidateMs));
    if (check.dateKey === ptNow.dateKey) {
      candidateMs += 3600 * 1000;
    } else if (check.hour > 0 || check.minute > 0 || check.second > 0) {
      const overshootSec = check.hour * 3600 + check.minute * 60 + check.second;
      candidateMs -= (overshootSec >= 43200 ? overshootSec - 86400 : overshootSec) * 1000;
    } else {
      break;
    }
  }

  const msRemaining = Math.max(0, candidateMs - nowMs);
  const totalSec = Math.floor(msRemaining / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  let nextResetBeijingLabel = '北京时间 16:00 / 17:00';
  try {
    const bjParts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(candidateMs));
    nextResetBeijingLabel = `北京时间 ${bjParts}`;
  } catch {
    // Keep default fallback
  }

  return {
    pacificDate: ptNow.dateKey,
    formattedCountdown: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
    nextResetBeijingLabel,
    msRemaining,
  };
}

/**
 * Computes per-model real-time official quota usage:
 * - RPD against the current Pacific Time calendar day
 * - RPM & TPM against the rolling 60-second window
 */
export function computeOfficialModelQuotas(
  entries: GeminiUsageLogEntry[],
  tierInput: GeminiAccountTier = DEFAULT_GEMINI_ACCOUNT_TIER,
  nowMs: number = Date.now()
): OfficialModelQuotaStatus[] {
  const tier = normalizeGeminiAccountTier(tierInput);
  const safeEntries = Array.isArray(entries) ? entries : [];
  const todayPt = getPacificDateKey(nowMs);
  const oneMinuteAgoMs = nowMs - 60_000;

  const models: SelectableGeminiModel[] = [
    'gemini-4-hydrogen',
    'gemini-4-argon',
    'gemini-3.1-flash-lite',
  ];

  const statsMap = new Map<
    SelectableGeminiModel,
    {
      todayRequests: number;
      todayTokens: number;
      lastMinuteRequests: number;
      lastMinuteTokens: number;
    }
  >();

  for (const m of models) {
    statsMap.set(m, {
      todayRequests: 0,
      todayTokens: 0,
      lastMinuteRequests: 0,
      lastMinuteTokens: 0,
    });
  }

  for (const entry of safeEntries) {
    const modelKey = normalizePreferredGeminiModel(
      entry.actualModel && entry.actualModel !== 'deterministic_fallback'
        ? entry.actualModel
        : entry.requestedModel
    );
    const bucket = statsMap.get(modelKey);
    if (!bucket) continue;

    const entryMs = Date.parse(entry.timestamp || '');
    if (Number.isNaN(entryMs)) continue;

    if (getPacificDateKey(entryMs) === todayPt) {
      bucket.todayRequests += 1;
      bucket.todayTokens += entry.totalTokens;
    }

    if (entryMs >= oneMinuteAgoMs && entryMs <= nowMs + 1000) {
      bucket.lastMinuteRequests += 1;
      bucket.lastMinuteTokens += entry.promptTokens || entry.totalTokens;
    }
  }

  return models.map((model) => {
    const limits = GEMINI_OFFICIAL_LIMITS[tier][model];
    const stat = statsMap.get(model)!;
    return {
      model,
      shortName: GEMINI_MODEL_PROFILES[model].shortName,
      tier,
      limits,
      todayRequests: stat.todayRequests,
      todayTokens: stat.todayTokens,
      lastMinuteRequests: stat.lastMinuteRequests,
      lastMinuteTokens: stat.lastMinuteTokens,
      rpdPercent: Math.min(100, Math.round((stat.todayRequests / Math.max(1, limits.rpd)) * 100)),
      rpmPercent: Math.min(
        100,
        Math.round((stat.lastMinuteRequests / Math.max(1, limits.rpm)) * 100)
      ),
      tpmPercent: Math.min(100, Math.round((stat.lastMinuteTokens / Math.max(1, limits.tpm)) * 100)),
    };
  });
}

export type QuotaTaskType =
  | 'knowledge_retrieval'
  | 'paper_preanalysis'
  | 'full_translation'
  | 'deep_derivation';

export interface QuotaTaskProfile {
  id: QuotaTaskType;
  labelZh: string;
  shortLabelZh: string;
  descriptionZh: string;
  defaultModel: SelectableGeminiModel;
}

export const QUOTA_TASK_PROFILES: Record<QuotaTaskType, QuotaTaskProfile> = {
  knowledge_retrieval: {
    id: 'knowledge_retrieval',
    labelZh: '教材建模与联网检索',
    shortLabelZh: '教材与检索',
    descriptionZh: '教材目录解析、arXiv/CrossRef 文献检索与基础知识报告生成，侧重高吞吐低耗。',
    defaultModel: 'gemini-3.1-flash-lite',
  },
  paper_preanalysis: {
    id: 'paper_preanalysis',
    labelZh: '论文预分析与缺口评估',
    shortLabelZh: '论文预分析',
    descriptionZh: '全局章节难度评估与 K1–K4 知识缺口定位，兼顾结构化理解与响应速度。',
    defaultModel: 'gemini-4-hydrogen',
  },
  full_translation: {
    id: 'full_translation',
    labelZh: '全文分节翻译与批注',
    shortLabelZh: '分节全文翻译',
    descriptionZh: '长篇论文多并发分节中文学术翻译与五类精准批注生成，Token 消耗较高。',
    defaultModel: 'gemini-4-hydrogen',
  },
  deep_derivation: {
    id: 'deep_derivation',
    labelZh: '复杂推导与伴读问答',
    shortLabelZh: '深度推导问答',
    descriptionZh: '张量演算、公式思维导图拆解与疑难段落深度追问，优先考虑推理严密性。',
    defaultModel: 'gemini-4-argon',
  },
};

export function mapWorkspaceTabToTaskType(tab: string | undefined): QuotaTaskType {
  switch (tab) {
    case 'pre_analysis':
      return 'paper_preanalysis';
    case 'translation':
      return 'full_translation';
    case 'knowledge':
    case 'verification':
    default:
      return 'knowledge_retrieval';
  }
}

export type BudgetPressureLevel = 'ample' | 'tight' | 'critical';

export interface ModelRecommendationResult {
  taskType: QuotaTaskType;
  taskProfile: QuotaTaskProfile;
  recommendedModel: SelectableGeminiModel;
  recommendedShortName: string;
  budgetStatus: BudgetPressureLevel;
  budgetStatusLabelZh: string;
  peakUtilizationPercent: number;
  dailyTokenPercent: number;
  remainingDailyTokens: number;
  pressureSourceZh: string;
  headlineZh: string;
  rationaleZh: string;
  efficiencyHintZh: string;
  shouldPromptSwitch: boolean;
  isFlashLiteSuggestion: boolean;
}

export function computeModelRecommendation(params: {
  taskType: QuotaTaskType;
  currentPreferredModel: SelectableGeminiModel;
  summary: QuotaUsageSummary;
  officialQuotas: OfficialModelQuotaStatus[];
  entries?: GeminiUsageLogEntry[];
}): ModelRecommendationResult {
  const { taskType, currentPreferredModel, summary, officialQuotas, entries = [] } = params;
  const taskProfile = QUOTA_TASK_PROFILES[taskType] || QUOTA_TASK_PROFILES.full_translation;
  const activeQuota =
    officialQuotas.find((q) => q.model === currentPreferredModel) || officialQuotas[0];
  const flashLiteQuota =
    officialQuotas.find((q) => q.model === 'gemini-3.1-flash-lite') || officialQuotas[0];

  const dailyTokenPercent = summary.todayBudgetPercent;
  const remainingDailyTokens = Math.max(0, summary.dailyTokenBudget - summary.todayTotalTokens);
  const rpdPercent = activeQuota ? activeQuota.rpdPercent : 0;
  const rpmPercent = activeQuota ? activeQuota.rpmPercent : 0;
  const tpmPercent = activeQuota ? activeQuota.tpmPercent : 0;

  const peakUtilizationPercent = Math.max(dailyTokenPercent, rpdPercent, rpmPercent, tpmPercent);

  // Check if recent requests for currentPreferredModel experienced fallback or degradation
  const recentForPreferred = Array.isArray(entries)
    ? entries
        .filter((e) => e && e.requestedModel === currentPreferredModel)
        .slice(0, 5)
    : [];
  const recentFallbackCount = recentForPreferred.filter(
    (e) => e.degraded || (e.actualModel && e.actualModel !== currentPreferredModel)
  ).length;
  const hasObservedFallback =
    currentPreferredModel !== 'gemini-3.1-flash-lite' && recentFallbackCount > 0;

  let budgetStatus: BudgetPressureLevel = 'ample';
  let budgetStatusLabelZh = '● 预算充裕';
  if (peakUtilizationPercent >= 85) {
    budgetStatus = 'critical';
    budgetStatusLabelZh = '▲ 预算告急';
  } else if (peakUtilizationPercent >= 60 || hasObservedFallback) {
    budgetStatus = 'tight';
    budgetStatusLabelZh = hasObservedFallback ? '▲ 模型回退/受限' : '▲ 预算紧张';
  }

  let pressureSourceZh = `日 Token 预算已用 ${dailyTokenPercent}%`;
  if (hasObservedFallback) {
    pressureSourceZh = `${GEMINI_MODEL_PROFILES[currentPreferredModel].shortName} 最近 ${recentFallbackCount} 次请求触发限流或超时回退`;
  } else if (
    rpdPercent >= dailyTokenPercent &&
    rpdPercent >= rpmPercent &&
    rpdPercent >= tpmPercent &&
    rpdPercent > 0
  ) {
    pressureSourceZh = `${activeQuota.shortName} 今日 RPD 已用 ${rpdPercent}%`;
  } else if (rpmPercent >= dailyTokenPercent && rpmPercent >= tpmPercent && rpmPercent > 0) {
    pressureSourceZh = `${activeQuota.shortName} 60 秒 RPM 已用 ${rpmPercent}%`;
  } else if (tpmPercent >= dailyTokenPercent && tpmPercent > 0) {
    pressureSourceZh = `${activeQuota.shortName} 60 秒 TPM 已用 ${tpmPercent}%`;
  }

  let recommendedModel: SelectableGeminiModel = taskProfile.defaultModel;
  if (budgetStatus === 'critical' || hasObservedFallback) {
    recommendedModel = 'gemini-3.1-flash-lite';
  } else if (budgetStatus === 'tight') {
    if (taskType === 'deep_derivation') {
      recommendedModel =
        peakUtilizationPercent >= 75 || rpdPercent >= 60
          ? 'gemini-3.1-flash-lite'
          : 'gemini-4-hydrogen';
    } else {
      recommendedModel = 'gemini-3.1-flash-lite';
    }
  }

  const recommendedProfile = GEMINI_MODEL_PROFILES[recommendedModel];
  const recommendedShortName = recommendedProfile.shortName;
  const shouldPromptSwitch = recommendedModel !== currentPreferredModel;
  const isFlashLiteSuggestion = recommendedModel === 'gemini-3.1-flash-lite';

  let headlineZh = '';
  let rationaleZh = '';

  if (hasObservedFallback && budgetStatus !== 'critical') {
    headlineZh = `检测到 ${GEMINI_MODEL_PROFILES[currentPreferredModel].shortName} 触发限流/超时回退：建议直连轻量级 Flash-Lite`;
    rationaleZh =
      `${pressureSourceZh}。切换至 ${recommendedProfile.titleZh} 可省去前置探测等待时间，直接以最高可用性与并发配额完成「${taskProfile.labelZh}」。`;
  } else if (budgetStatus === 'critical') {
    headlineZh = shouldPromptSwitch
      ? `预算告急（峰值 ${peakUtilizationPercent}%）：建议立即切换至轻量级 Flash-Lite`
      : `预算告急（峰值 ${peakUtilizationPercent}%）：当前已启用 Flash-Lite 保底省流模式`;
    rationaleZh =
      `${pressureSourceZh}（今日剩余 ${remainingDailyTokens.toLocaleString()} Tokens）。` +
      `针对「${taskProfile.labelZh}」，建议采用更轻量级的 ${recommendedProfile.titleZh} 降低单次 Token 开销并避免触发 429 配额耗尽。`;
  } else if (budgetStatus === 'tight') {
    if (recommendedModel === 'gemini-3.1-flash-lite') {
      headlineZh = shouldPromptSwitch
        ? `预算紧张（峰值 ${peakUtilizationPercent}%）：建议切换至轻量级 Flash-Lite`
        : `预算紧张（峰值 ${peakUtilizationPercent}%）：当前已使用轻量级 Flash-Lite`;
      rationaleZh =
        `${pressureSourceZh}（今日剩余 ${remainingDailyTokens.toLocaleString()} Tokens）。` +
        `在「${taskProfile.labelZh}」场景下切换至 Flash-Lite 可显著节省 Token 消耗，并享有更高的官方 RPM/RPD 并发余量。`;
    } else {
      headlineZh = shouldPromptSwitch
        ? `预算紧张（峰值 ${peakUtilizationPercent}%）：建议由 Argon 降档为 Hydrogen`
        : `预算紧张（峰值 ${peakUtilizationPercent}%）：Hydrogen 可平衡推导精度与配额`;
      rationaleZh =
        `${pressureSourceZh}（今日剩余 ${remainingDailyTokens.toLocaleString()} Tokens）。` +
        `当前为「${taskProfile.labelZh}」任务，Hydrogen 在保持数学推导准确度的同时消耗低于旗舰 Argon；若配额继续逼近 75%，建议直接切换至 Flash-Lite。`;
    }
  } else {
    headlineZh = shouldPromptSwitch
      ? `预算充裕：针对「${taskProfile.labelZh}」推荐使用 ${recommendedShortName}`
      : `预算充裕：当前模型 ${recommendedShortName} 最契合「${taskProfile.labelZh}」`;
    if (recommendedModel === 'gemini-3.1-flash-lite') {
      rationaleZh =
        `当前额度余量充足（今日剩余 ${remainingDailyTokens.toLocaleString()} Tokens）。` +
        `「${taskProfile.labelZh}」以高速结构化检索与目录提取为主，轻量级 Flash-Lite 响应最快且几乎不占主力推理配额。`;
    } else if (recommendedModel === 'gemini-4-argon') {
      rationaleZh =
        `当前额度余量充足（今日剩余 ${remainingDailyTokens.toLocaleString()} Tokens）。` +
        `「${taskProfile.labelZh}」涉及高阶物理公式与严密数学推导，旗舰 Argon 可提供最高推理深度。`;
    } else {
      rationaleZh =
        `当前额度余量充足（今日剩余 ${remainingDailyTokens.toLocaleString()} Tokens）。` +
        `「${taskProfile.labelZh}」需要长上下文分节译注与高吞吐稳定性，主力 Hydrogen 综合性价比最优。`;
    }
  }

  const flashRemainingRpd = flashLiteQuota
    ? Math.max(0, flashLiteQuota.limits.rpd - flashLiteQuota.todayRequests)
    : 1500;
  const efficiencyHintZh = flashLiteQuota
    ? `Flash-Lite 当前层级限额 ${flashLiteQuota.limits.rpm.toLocaleString()} RPM · 今日 RPD 剩余 ${flashRemainingRpd.toLocaleString()} 次`
    : 'Flash-Lite 提供更高轻量级并发与日配额余量';

  return {
    taskType,
    taskProfile,
    recommendedModel,
    recommendedShortName,
    budgetStatus,
    budgetStatusLabelZh,
    peakUtilizationPercent,
    dailyTokenPercent,
    remainingDailyTokens,
    pressureSourceZh,
    headlineZh,
    rationaleZh,
    efficiencyHintZh,
    shouldPromptSwitch,
    isFlashLiteSuggestion,
  };
}

export function extractGenerationMetaFromApiPayload(payload: unknown): GenerationMeta | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (obj.generationMeta && typeof obj.generationMeta === 'object') {
    return obj.generationMeta as GenerationMeta;
  }
  const nestedKeys = ['section', 'mindMap', 'preAnalysis', 'document', 'report', 'reply'];
  for (const key of nestedKeys) {
    const child = obj[key];
    if (child && typeof child === 'object') {
      const childMeta = (child as Record<string, unknown>).generationMeta;
      if (childMeta && typeof childMeta === 'object') {
        return childMeta as GenerationMeta;
      }
    }
  }
  return null;
}

// Browser-side state and fetch interceptor for automatic header injection & usage telemetry capture
let currentPreferredModel: SelectableGeminiModel = DEFAULT_PREFERRED_GEMINI_MODEL;
let currentRoutingMode: ModelRoutingMode = DEFAULT_MODEL_ROUTING_MODE;
let interceptorInstalled = false;
const usageListeners = new Set<(entries: GeminiUsageLogEntry[]) => void>();

export function setActiveGeminiModelConfig(
  model: SelectableGeminiModel,
  routingMode: ModelRoutingMode
): void {
  currentPreferredModel = normalizePreferredGeminiModel(model);
  currentRoutingMode = normalizeModelRoutingMode(routingMode);
}

export function loadStoredUsageLedger(): GeminiUsageLogEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(QUOTA_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    return normalizeUsageLogEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveStoredUsageLedger(entries: GeminiUsageLogEntry[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const trimmed = entries.slice(0, MAX_STORED_USAGE_ENTRIES);
    window.localStorage.setItem(QUOTA_LEDGER_STORAGE_KEY, JSON.stringify(trimmed));
    for (const listener of usageListeners) {
      listener(trimmed);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function appendUsageLogEntry(entry: GeminiUsageLogEntry): GeminiUsageLogEntry[] {
  const current = loadStoredUsageLedger();
  const next = [entry, ...current].slice(0, MAX_STORED_USAGE_ENTRIES);
  saveStoredUsageLedger(next);
  return next;
}

export function clearStoredUsageLedger(): void {
  saveStoredUsageLedger([]);
}

export function subscribeToUsageLedger(
  listener: (entries: GeminiUsageLogEntry[]) => void
): () => void {
  usageListeners.add(listener);
  return () => {
    usageListeners.delete(listener);
  };
}

const nativeFetchRef: typeof fetch | null =
  typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null;

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const baseFetch =
    nativeFetchRef ||
    (typeof window !== 'undefined' && typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : fetch);

  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url || '';

  const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
  let nextInit = init;

  if (isApiCall) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has('x-preferred-gemini-model')) {
      headers.set('x-preferred-gemini-model', currentPreferredModel);
    }
    if (!headers.has('x-model-routing-mode')) {
      headers.set('x-model-routing-mode', currentRoutingMode);
    }
    nextInit = {
      ...init,
      headers,
    };
  }

  const startTime = Date.now();
  const response = await baseFetch(input, nextInit);

  if (
    isApiCall &&
    !urlStr.includes('/api/health') &&
    !urlStr.includes('/api/usage-stats') &&
    !urlStr.includes('/api/fetch-arxiv')
  ) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      const meta = extractGenerationMetaFromApiPayload(data);
      if (meta) {
        const promptTokens =
          typeof meta.promptTokens === 'number' && meta.promptTokens > 0
            ? meta.promptTokens
            : estimateTokensFromText(typeof init?.body === 'string' ? init.body : '') || 180;
        const completionTokens =
          typeof meta.completionTokens === 'number' && meta.completionTokens > 0
            ? meta.completionTokens
            : estimateTokensFromText(JSON.stringify(data)) || 320;
        const totalTokens =
          typeof meta.totalTokens === 'number' && meta.totalTokens > 0
            ? meta.totalTokens
            : promptTokens + completionTokens;
        const latencyMs =
          typeof meta.latencyMs === 'number' && meta.latencyMs > 0
            ? meta.latencyMs
            : Math.max(1, Date.now() - startTime);

        appendUsageLogEntry({
          id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: meta.timestamp || new Date().toISOString(),
          endpoint: urlStr,
          stageLabelZh: inferStageLabelZhFromEndpoint(urlStr),
          requestedModel: meta.requestedModel || currentPreferredModel,
          actualModel:
            meta.modelUsed ||
            (meta.degraded ? 'deterministic_fallback' : currentPreferredModel),
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          degraded: Boolean(meta.degraded),
        });
      }
    } catch {
      // Non-JSON or aborted response; ignore
    }
  }

  return response;
}

export function installQuotaFetchInterceptor(): void {
  if (typeof window === 'undefined' || interceptorInstalled) return;
  interceptorInstalled = true;
  try {
    const desc =
      Object.getOwnPropertyDescriptor(window, 'fetch') ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch');
    if (!desc || desc.writable || typeof desc.set === 'function') {
      window.fetch = apiFetch;
    } else if (desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: apiFetch,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // In sandboxed iframes where window.fetch is non-writable and non-configurable,
    // all components invoke apiFetch() directly.
  }
}


import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Cpu,
  Activity,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sparkles,
  Clock,
  Gauge,
  ExternalLink,
} from 'lucide-react';
import type {
  ActiveWorkspaceTab,
  GeminiAccountTier,
  GeminiUsageLogEntry,
  ModelRoutingMode,
  SelectableGeminiModel,
} from '../types/physics';
import {
  GEMINI_MODEL_PROFILES,
  computeQuotaSummary,
  computeOfficialModelQuotas,
  computePacificResetCountdown,
  computeModelRecommendation,
  mapWorkspaceTabToTaskType,
  DEFAULT_DAILY_TOKEN_BUDGET,
  apiFetch,
  type QuotaTaskType,
} from '../utils/quotaTracker';
import { ModelRecommendationCard } from './ModelRecommendationCard';

interface QuotaAndModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspaceTab?: ActiveWorkspaceTab;
  preferredModel: SelectableGeminiModel;
  onChangePreferredModel: (model: SelectableGeminiModel) => void;
  routingMode: ModelRoutingMode;
  onChangeRoutingMode: (mode: ModelRoutingMode) => void;
  accountTier: GeminiAccountTier;
  onChangeAccountTier: (tier: GeminiAccountTier) => void;
  dailyTokenBudget: number;
  onChangeDailyTokenBudget: (budget: number) => void;
  usageEntries: GeminiUsageLogEntry[];
  onClearUsageEntries: () => void;
}

const BUDGET_PRESETS = [
  { label: '100k Tokens / 日（轻量精读）', value: 100_000 },
  { label: '500k Tokens / 日（标准科研，默认）', value: 500_000 },
  { label: '1.5M Tokens / 日（多篇长文连译）', value: 1_500_000 },
  { label: '5M Tokens / 日（课题组高强度）', value: 5_000_000 },
];

function formatCompactTokens(num: number): string {
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return `${Number.isInteger(val) ? val : val.toFixed(1)}M`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return `${Number.isInteger(val) ? val : val.toFixed(1)}k`;
  }
  return String(num);
}

function getBarAccentClass(percent: number): string {
  if (percent >= 85) return 'accent-rose-600';
  if (percent >= 65) return 'accent-amber-500';
  return 'accent-blue-600';
}

export const QuotaAndModelModal: React.FC<QuotaAndModelModalProps> = ({
  isOpen,
  onClose,
  activeWorkspaceTab,
  preferredModel,
  onChangePreferredModel,
  routingMode,
  onChangeRoutingMode,
  accountTier,
  onChangeAccountTier,
  dailyTokenBudget,
  onChangeDailyTokenBudget,
  usageEntries,
  onClearUsageEntries,
}) => {
  const [serverEntries, setServerEntries] = useState<GeminiUsageLogEntry[]>([]);
  const [isLoadingServer, setIsLoadingServer] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedTaskType, setSelectedTaskType] = useState<QuotaTaskType>(() =>
    mapWorkspaceTabToTaskType(activeWorkspaceTab)
  );

  const fetchServerUsageStats = async () => {
    setIsLoadingServer(true);
    try {
      const resp = await apiFetch('/api/usage-stats');
      if (resp.ok) {
        const data = (await resp.json()) as {
          recentEntries?: GeminiUsageLogEntry[];
        };
        if (Array.isArray(data.recentEntries)) {
          setServerEntries(data.recentEntries);
        }
      }
    } catch {
      // Ignore network error when offline
    } finally {
      setIsLoadingServer(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setNowMs(Date.now());
      setSelectedTaskType(mapWorkspaceTabToTaskType(activeWorkspaceTab));
      fetchServerUsageStats();
    }
  }, [isOpen, usageEntries.length, activeWorkspaceTab]);

  // 1-second live tick while modal is open so 60s rolling RPM/TPM windows and PT midnight countdown stay live
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // Merge client localStorage entries with server-recorded entries if client ledger is empty
  const effectiveEntries = useMemo(() => {
    if (usageEntries.length > 0) return usageEntries;
    return serverEntries;
  }, [usageEntries, serverEntries]);

  const summary = useMemo(
    () =>
      computeQuotaSummary(
        effectiveEntries,
        dailyTokenBudget || DEFAULT_DAILY_TOKEN_BUDGET
      ),
    [effectiveEntries, dailyTokenBudget]
  );

  const officialModelQuotas = useMemo(
    () => computeOfficialModelQuotas(effectiveEntries, accountTier, nowMs),
    [effectiveEntries, accountTier, nowMs]
  );

  const activeOfficialQuota = useMemo(
    () =>
      officialModelQuotas.find((q) => q.model === preferredModel) || officialModelQuotas[0],
    [officialModelQuotas, preferredModel]
  );

  const recommendation = useMemo(
    () =>
      computeModelRecommendation({
        taskType: selectedTaskType,
        currentPreferredModel: preferredModel,
        summary,
        officialQuotas: officialModelQuotas,
      }),
    [selectedTaskType, preferredModel, summary, officialModelQuotas]
  );

  const resetCountdown = useMemo(() => computePacificResetCountdown(nowMs), [nowMs]);

  if (!isOpen) return null;

  const handleResetAll = async () => {
    onClearUsageEntries();
    try {
      await apiFetch('/api/usage-stats/reset', { method: 'POST' });
      setServerEntries([]);
    } catch {
      // Ignore
    }
  };

  const isNearOfficialLimit =
    activeOfficialQuota.rpdPercent >= 80 ||
    activeOfficialQuota.rpmPercent >= 80 ||
    activeOfficialQuota.tpmPercent >= 80;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quota-model-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-3 sm:p-5"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 id="quota-model-modal-title" className="text-base font-bold text-slate-900">
                AI 额度实时监控与 Gemini 模型切换中心
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                自由切换 Gemini Hydrogen / Argon 推理模型，对照 Google 官方 Free / Tier 1 限额实时追踪 RPD、RPM 与 TPM 消耗
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭额度监控与模型面板"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Gemini Model Selector (Hydrogen / Argon / Flash-Lite) */}
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <span>1. 选择 Gemini 核心计算模型（Hydrogen / Argon）</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  切换后立即作用于后续的论文预分析、分节深度翻译、公式推导思维导图与伴读导师问答。
                </p>
              </div>

              {/* Routing Mode Toggle */}
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md self-start">
                <button
                  type="button"
                  onClick={() => onChangeRoutingMode('cascade')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    routingMode === 'cascade'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  智能级联容错（推荐）
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRoutingMode('strict')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    routingMode === 'strict'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  严格锁定所选模型
                </button>
              </div>
            </div>

            {/* Task & Token Budget Model Recommendation Component */}
            <ModelRecommendationCard
              taskType={selectedTaskType}
              onChangeTaskType={setSelectedTaskType}
              recommendation={recommendation}
              onApplyRecommendedModel={onChangePreferredModel}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(
                [
                  'gemini-4-hydrogen',
                  'gemini-4-argon',
                  'gemini-3.1-flash-lite',
                ] as SelectableGeminiModel[]
              ).map((modelKey) => {
                const profile = GEMINI_MODEL_PROFILES[modelKey];
                const quotaStat = officialModelQuotas.find((q) => q.model === modelKey)!;
                const isSelected = preferredModel === modelKey;
                return (
                  <button
                    key={modelKey}
                    type="button"
                    data-testid={`select-model-${modelKey}`}
                    onClick={() => onChangePreferredModel(modelKey)}
                    className={`text-left p-4 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          {modelKey === 'gemini-4-argon' ? (
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          {profile.shortName}
                        </span>
                        <span
                          className={`text-[11px] font-mono-tabular font-semibold ${
                            isSelected ? 'text-blue-700' : 'text-slate-500'
                          }`}
                        >
                          {isSelected ? '● 当前激活' : '点击选用'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-500">
                        {profile.model} · {profile.badgeText}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed pt-1">
                        {profile.descriptionZh}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                      <div>
                        <span className="font-medium text-slate-700">推理深度：</span>
                        {profile.reasoningRating} · <span className="font-medium text-slate-700">速度：</span>
                        {profile.speedRating}
                      </div>
                      <div className="font-mono-tabular text-slate-600">
                        <span className="font-sans font-medium text-slate-700">
                          {accountTier === 'free' ? 'Free 限额：' : 'Tier 1 限额：'}
                        </span>
                        {quotaStat.limits.rpm} RPM · {formatCompactTokens(quotaStat.limits.tpm)} TPM ·{' '}
                        {quotaStat.limits.rpd.toLocaleString()} RPD
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Official Gemini API Quota Limits (Free Tier vs Tier 1) & Countdown */}
          <section
            data-testid="official-quota-panel"
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-blue-600" />
                  <span>2. Google Gemini 官方配额限额监控（RPD · RPM · TPM）</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  按 Google 官方「太平洋时间午夜 (00:00 PT)」统计每日请求配额 (RPD) 与「60 秒滚动窗口」速率上限 (RPM / TPM)。
                </p>
              </div>

              {/* Account Tier Switcher: Free Tier vs Paid Tier 1 */}
              <div
                role="group"
                aria-label="选择 Google AI Studio 账户配额层级"
                className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-md self-start shrink-0"
              >
                <button
                  type="button"
                  data-testid="tier-free"
                  onClick={() => onChangeAccountTier('free')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    accountTier === 'free'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  免费层级 (Free Tier)
                </button>
                <button
                  type="button"
                  data-testid="tier-tier1"
                  onClick={() => onChangeAccountTier('tier1')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    accountTier === 'tier1'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  付费层级 (Tier 1)
                </button>
              </div>
            </div>

            {/* Reset Countdown Banner */}
            <div className="bg-white border border-slate-200 rounded-md px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  官方每日配额 (RPD) 重置倒计时（当前 PT 日期{' '}
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {resetCountdown.pacificDate}
                  </span>
                  ）：
                </span>
                <span
                  data-testid="pt-reset-countdown"
                  className="font-mono-tabular font-bold text-blue-700 text-sm"
                >
                  {resetCountdown.formattedCountdown}
                </span>
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-500">
                下次重置：{resetCountdown.nextResetBeijingLabel}（00:00 PT）
              </div>
            </div>

            {/* 3 Active Model Official Limit Cards: RPD, RPM, TPM */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* RPD */}
              <div
                data-testid="active-rpd-card"
                className="bg-white border border-slate-200 rounded-md p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{activeOfficialQuota.shortName} · 今日请求次数 (RPD)</span>
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {activeOfficialQuota.rpdPercent}%
                  </span>
                </div>
                <div className="text-lg font-bold font-mono-tabular text-slate-900">
                  {activeOfficialQuota.todayRequests.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    / {activeOfficialQuota.limits.rpd.toLocaleString()} 次/日
                  </span>
                </div>
                <progress
                  value={Math.min(activeOfficialQuota.todayRequests, activeOfficialQuota.limits.rpd)}
                  max={activeOfficialQuota.limits.rpd}
                  className={`w-full h-1.5 overflow-hidden rounded-full bg-slate-100 block ${getBarAccentClass(
                    activeOfficialQuota.rpdPercent
                  )}`}
                />
                <div className="text-[11px] text-slate-500 font-mono-tabular">
                  今日剩余：{Math.max(0, activeOfficialQuota.limits.rpd - activeOfficialQuota.todayRequests).toLocaleString()} 次
                </div>
              </div>

              {/* RPM */}
              <div
                data-testid="active-rpm-card"
                className="bg-white border border-slate-200 rounded-md p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{activeOfficialQuota.shortName} · 60秒请求速率 (RPM)</span>
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {activeOfficialQuota.rpmPercent}%
                  </span>
                </div>
                <div className="text-lg font-bold font-mono-tabular text-slate-900">
                  {activeOfficialQuota.lastMinuteRequests.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    / {activeOfficialQuota.limits.rpm.toLocaleString()} 次/分
                  </span>
                </div>
                <progress
                  value={Math.min(
                    activeOfficialQuota.lastMinuteRequests,
                    activeOfficialQuota.limits.rpm
                  )}
                  max={activeOfficialQuota.limits.rpm}
                  className={`w-full h-1.5 overflow-hidden rounded-full bg-slate-100 block ${getBarAccentClass(
                    activeOfficialQuota.rpmPercent
                  )}`}
                />
                <div className="text-[11px] text-slate-500 font-mono-tabular">
                  60 秒滑动窗口可发：
                  {Math.max(0, activeOfficialQuota.limits.rpm - activeOfficialQuota.lastMinuteRequests).toLocaleString()} 次
                </div>
              </div>

              {/* TPM */}
              <div
                data-testid="active-tpm-card"
                className="bg-white border border-slate-200 rounded-md p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{activeOfficialQuota.shortName} · 60秒 Token 吞吐 (TPM)</span>
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {activeOfficialQuota.tpmPercent}%
                  </span>
                </div>
                <div className="text-lg font-bold font-mono-tabular text-slate-900">
                  {formatCompactTokens(activeOfficialQuota.lastMinuteTokens)}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    / {formatCompactTokens(activeOfficialQuota.limits.tpm)} tok/分
                  </span>
                </div>
                <progress
                  value={Math.min(
                    activeOfficialQuota.lastMinuteTokens,
                    activeOfficialQuota.limits.tpm
                  )}
                  max={activeOfficialQuota.limits.tpm}
                  className={`w-full h-1.5 overflow-hidden rounded-full bg-slate-100 block ${getBarAccentClass(
                    activeOfficialQuota.tpmPercent
                  )}`}
                />
                <div className="text-[11px] text-slate-500 font-mono-tabular">
                  60 秒余量：{formatCompactTokens(Math.max(0, activeOfficialQuota.limits.tpm - activeOfficialQuota.lastMinuteTokens))} tok
                </div>
              </div>
            </div>

            {/* 3-Model Official Quota Comparison Matrix */}
            <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3 font-medium">模型</th>
                    <th className="py-2 px-3 font-medium text-right">RPD（今日已用 / 官方上限）</th>
                    <th className="py-2 px-3 font-medium text-right">RPM（60秒 / 上限）</th>
                    <th className="py-2 px-3 font-medium text-right">TPM（60秒 / 上限）</th>
                    <th className="py-2 px-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-tabular">
                  {officialModelQuotas.map((row) => {
                    const isCurrent = row.model === preferredModel;
                    return (
                      <tr
                        key={row.model}
                        className={isCurrent ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-2 px-3 font-sans whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{row.shortName}</span>
                          <span className="text-[11px] font-mono-tabular text-slate-400 ml-1.5">
                            {row.model}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">
                          <span className={row.rpdPercent >= 80 ? 'text-amber-700 font-bold' : ''}>
                            {row.todayRequests.toLocaleString()}
                          </span>{' '}
                          / {row.limits.rpd.toLocaleString()} ({row.rpdPercent}%)
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">
                          {row.lastMinuteRequests} / {row.limits.rpm.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">
                          {formatCompactTokens(row.lastMinuteTokens)} / {formatCompactTokens(row.limits.tpm)}
                        </td>
                        <td className="py-2 px-3 text-right font-sans whitespace-nowrap">
                          {isCurrent ? (
                            <span className="text-[11px] font-semibold text-blue-700">当前使用中</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onChangePreferredModel(row.model)}
                              className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
                            >
                              切换至 {row.shortName}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                注：官方具体限额随账号信誉与最新文档动态调整；当触发 `429` 限流时，智能级联模式会自动回退至余量更高的模型。
              </span>
              <a
                href="https://aistudio.google.com/app/rate-limit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium shrink-0"
              >
                <span>前往 AI Studio 查看实时账户限额</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </section>

          {/* 3. Real-time Token Quota Dashboard & Stage Breakdown */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <span>3. 个人每日 Token 预算与工作流消耗统计（UTC {summary.todayDateUtc}）</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  精确采集每次模型响应的输入 Prompt Tokens 与输出 Completion Tokens，掌握科研精读成本分布。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="daily-budget-select" className="text-xs text-slate-600 whitespace-nowrap">
                  个人日预算参考：
                </label>
                <select
                  id="daily-budget-select"
                  value={dailyTokenBudget}
                  onChange={(e) => onChangeDailyTokenBudget(Number(e.target.value))}
                  className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 font-mono-tabular"
                >
                  {BUDGET_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={fetchServerUsageStats}
                  disabled={isLoadingServer}
                  title="同步服务端最新统计"
                  aria-label="同步服务端最新统计"
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingServer ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  今日已用总 Token：
                  <span className="font-mono-tabular text-blue-600 ml-1">
                    {summary.todayTotalTokens.toLocaleString()}
                  </span>{' '}
                  / {summary.dailyTokenBudget.toLocaleString()} Tokens
                </span>
                <span
                  className={`font-mono-tabular font-semibold ${
                    summary.todayBudgetPercent >= 85
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  已用 {summary.todayBudgetPercent}%
                </span>
              </div>
              <progress
                value={Math.min(summary.todayTotalTokens, summary.dailyTokenBudget)}
                max={summary.dailyTokenBudget}
                className="w-full h-2 overflow-hidden rounded-full bg-slate-200 accent-blue-600 block"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono-tabular">
                <span>
                  累计历史总调用：{summary.allTimeCalls} 次 · 累计总消耗：
                  {summary.allTimeTotalTokens.toLocaleString()} Tokens
                </span>
                <span>
                  当前调度策略：{GEMINI_MODEL_PROFILES[preferredModel].shortName} (
                  {routingMode === 'strict' ? '严格锁定' : '智能级联'})
                </span>
              </div>
            </div>

            {/* 4 KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50/70 border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">今日 AI 调用次数</div>
                <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                  {summary.todayCalls}
                  <span className="text-xs font-normal text-slate-400 ml-1">次</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-mono-tabular">
                  成功 {Math.max(0, summary.todayCalls - summary.todayDegradedCalls)} · 降级{' '}
                  {summary.todayDegradedCalls}
                </div>
              </div>

              <div className="bg-slate-50/70 border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">今日输入 (Prompt)</div>
                <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                  {summary.todayPromptTokens.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">tok</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">原文与知识图谱上下文</div>
              </div>

              <div className="bg-slate-50/70 border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">今日输出 (Completion)</div>
                <div className="text-xl font-bold font-mono-tabular text-blue-600 mt-1">
                  {summary.todayCompletionTokens.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">tok</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">中文译文与五类批注生成</div>
              </div>

              <div className="bg-slate-50/70 border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">平均响应耗时</div>
                <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                  {summary.avgLatencyMs > 0 ? (summary.avgLatencyMs / 1000).toFixed(1) : '—'}
                  <span className="text-xs font-normal text-slate-400 ml-1">s</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">单次请求端到端延迟</div>
              </div>
            </div>

            {/* Breakdown by Model & Stage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50/50 border border-slate-200 rounded-md p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-slate-800">
                  按 Gemini 模型统计 Token 累计分布
                </div>
                <div className="space-y-2">
                  {summary.byModel.map((m) => (
                    <div
                      key={m.model}
                      className="flex items-center justify-between text-xs border-b border-slate-200/70 last:border-b-0 pb-1.5 last:pb-0"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{m.shortName}</span>
                        <span className="text-[11px] font-mono-tabular text-slate-400 ml-1.5">
                          ({m.model})
                        </span>
                      </div>
                      <div className="font-mono-tabular text-slate-700">
                        {m.calls} 次 · {m.totalTokens.toLocaleString()} tok ({m.percentOfTotalTokens}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50/50 border border-slate-200 rounded-md p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-slate-800">
                  按科研工作流阶段统计消耗
                </div>
                {summary.byStage.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2">
                    当前暂无 AI 调用记录。执行预分析、分节翻译或伴读问答后将实时显示。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {summary.byStage.slice(0, 5).map((st) => (
                      <div
                        key={st.stageLabelZh}
                        className="flex items-center justify-between text-xs border-b border-slate-200/70 last:border-b-0 pb-1.5 last:pb-0"
                      >
                        <span className="text-slate-700">{st.stageLabelZh}</span>
                        <span className="font-mono-tabular text-slate-700">
                          {st.calls} 次 · {st.totalTokens.toLocaleString()} tok ({st.percentOfTotalTokens}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 4. Recent Call Audit Log */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800">
                4. 最近 AI 调用审计流水（共 {effectiveEntries.length} 条记录）
              </h3>
              {effectiveEntries.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>清空统计流水</span>
                </button>
              )}
            </div>

            {effectiveEntries.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-6 text-center text-xs text-slate-500">
                暂无调用流水记录。当您点击「生成个人知识报告」「执行论文预分析」「开始全文分节翻译」或「伴读提问」时，每次调用的模型、输入/输出 Token 与耗时都会实时记录在此。
              </div>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 font-medium">时间</th>
                      <th className="py-2 px-3 font-medium">工作流阶段</th>
                      <th className="py-2 px-3 font-medium">请求模型 → 实际执行</th>
                      <th className="py-2 px-3 font-medium text-right">输入/输出 Token</th>
                      <th className="py-2 px-3 font-medium text-right">总 Token</th>
                      <th className="py-2 px-3 font-medium text-right">耗时</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono-tabular">
                    {effectiveEntries.slice(0, 30).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                          {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-800 whitespace-nowrap">
                          {item.stageLabelZh}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="text-slate-700">{item.requestedModel}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span
                            className={
                              item.degraded
                                ? 'text-amber-700 font-semibold'
                                : 'text-blue-700 font-semibold'
                            }
                          >
                            {item.actualModel}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap">
                          {item.promptTokens.toLocaleString()} / {item.completionTokens.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {item.totalTokens.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500 whitespace-nowrap">
                          {(item.latencyMs / 1000).toFixed(1)}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            {isNearOfficialLimit || summary.todayBudgetPercent >= 85 ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  {activeOfficialQuota.shortName} 在{' '}
                  {accountTier === 'free' ? 'Free Tier' : 'Tier 1'} 下配额已用较深，建议切换至 Hydrogen / Flash-Lite 或开启智能级联。
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  当前激活：<strong>{GEMINI_MODEL_PROFILES[preferredModel].shortName}</strong> ·{' '}
                  {accountTier === 'free' ? '免费层级 (Free Tier)' : '付费层级 (Tier 1)'}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors cursor-pointer"
          >
            完成并关闭
          </button>
        </div>
      </div>
    </div>
  );
};

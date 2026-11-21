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
  SlidersHorizontal,
  Wifi,
} from 'lucide-react';
import type {
  ActiveWorkspaceTab,
  AnnotationDetailLevel,
  GeminiAccountTier,
  GeminiUsageLogEntry,
  ModelConnectivityProbeResponse,
  ModelConnectivityProbeResult,
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
import {
  ANNOTATION_DETAIL_PROFILES,
  getAnnotationDetailProfile,
} from '../utils/annotationSettings';
import { ModelRecommendationCard } from './ModelRecommendationCard';

const DETAIL_LEVELS: AnnotationDetailLevel[] = [1, 2, 3, 4, 5];

let cachedModelProbeResponse: ModelConnectivityProbeResponse | null = null;

function formatProbeLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

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
  annotationDetailLevel: AnnotationDetailLevel;
  onChangeAnnotationDetailLevel: (level: AnnotationDetailLevel) => void;
  hasActivePaperForRegen?: boolean;
  isTranslatingFull?: boolean;
  onRegenerateWithNewLevel?: () => Promise<void>;
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
  annotationDetailLevel,
  onChangeAnnotationDetailLevel,
  hasActivePaperForRegen = false,
  isTranslatingFull = false,
  onRegenerateWithNewLevel,
  usageEntries,
  onClearUsageEntries,
}) => {
  const [serverEntries, setServerEntries] = useState<GeminiUsageLogEntry[]>([]);
  const [isLoadingServer, setIsLoadingServer] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedTaskType, setSelectedTaskType] = useState<QuotaTaskType>(() =>
    mapWorkspaceTabToTaskType(activeWorkspaceTab)
  );
  const [probeResponse, setProbeResponse] = useState<ModelConnectivityProbeResponse | null>(
    () => cachedModelProbeResponse
  );
  const [isProbingModels, setIsProbingModels] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const handleProbeModelsConnectivity = async () => {
    setIsProbingModels(true);
    setProbeError(null);
    try {
      const resp = await apiFetch('/api/probe-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 20_000 }),
      });
      const data = (await resp.json()) as ModelConnectivityProbeResponse & { error?: string };
      if (!resp.ok || !Array.isArray(data.results)) {
        setProbeError(data.error || `检测请求失败 (HTTP ${resp.status})`);
        return;
      }
      cachedModelProbeResponse = data;
      setProbeResponse(data);
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : '连通性检测网络请求失败，请稍后重试。');
    } finally {
      setIsProbingModels(false);
    }
  };

  const probeResultByModel = useMemo(() => {
    const map = new Map<SelectableGeminiModel, ModelConnectivityProbeResult>();
    if (probeResponse?.results) {
      for (const item of probeResponse.results) {
        map.set(item.model, item);
      }
    }
    return map;
  }, [probeResponse]);

  const availableProbedModels = useMemo(
    () =>
      (probeResponse?.results || [])
        .filter((r) => r.ok)
        .sort((a, b) => a.latencyMs - b.latencyMs),
    [probeResponse]
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
        entries: effectiveEntries,
      }),
    [selectedTaskType, preferredModel, summary, officialModelQuotas, effectiveEntries]
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

  const activeDetailProfile = useMemo(
    () => getAnnotationDetailProfile(annotationDetailLevel),
    [annotationDetailLevel]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quota-model-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-3 sm:p-5"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 id="quota-model-modal-title" className="text-base font-bold text-slate-900">
                AI 模型、官方配额与批注设置中心
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                统一管理 Gemini 模型切换、批注详略档位 (Lv.1–5)、Google 官方限额与每日 Token 预算
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
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Unified Annotation Detail Level Control (Merged from SettingsModal) */}
          <section
            data-testid="unified-detail-settings"
            className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 sm:p-4 space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                  <span>全局批注详细程度与公式推导深度（作用于预分析、翻译、思维导图与伴读问答）</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  <span data-testid="settings-detail-badge" className="font-mono-tabular font-semibold text-blue-700 mr-1.5">
                    Lv.{activeDetailProfile.level} {activeDetailProfile.shortLabel}
                  </span>
                  <span aria-hidden="true">·</span>{' '}
                  <span>{activeDetailProfile.academicProfile}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono-tabular text-slate-700">{activeDetailProfile.derivationStepHint}</span>
                </div>
              </div>

              <div
                role="group"
                aria-label="选择批注详细程度档位"
                className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-md shrink-0 self-start sm:self-center"
              >
                {DETAIL_LEVELS.map((lvl) => {
                  const prof = ANNOTATION_DETAIL_PROFILES[lvl];
                  const isActive = lvl === annotationDetailLevel;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => onChangeAnnotationDetailLevel(lvl)}
                      aria-pressed={isActive}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      Lv.{lvl} {prof.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {activeDetailProfile.annotationDepthSummary}
            </p>
          </section>

          {/* 1. Gemini Model Selector (Gemini 4 Series + Flash-Lite) */}
          <section className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>1. 选择 Gemini 模型（Gemini 4 全系列 / Flash-Lite）</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  切换后立即作用于预分析、分节翻译、公式推导导图与伴读问答。
                </p>
              </div>

              {/* Routing Mode Toggle + One-Click Live Connectivity Probe */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 self-start lg:self-center">
                <button
                  type="button"
                  data-testid="probe-models-btn"
                  onClick={handleProbeModelsConnectivity}
                  disabled={isProbingModels}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isProbingModels ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isProbingModels
                      ? '检测中...'
                      : probeResponse
                      ? '重新检测连通性'
                      : '一键检测连通性'}
                  </span>
                </button>
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md shrink-0">
                  <button
                    type="button"
                    onClick={() => onChangeRoutingMode('cascade')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      routingMode === 'cascade'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    智能级联容错
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeRoutingMode('strict')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      routingMode === 'strict'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    严格锁定模型
                  </button>
                </div>
              </div>
            </div>

            {/* Live Connectivity Probe Summary Strip */}
            {(isProbingModels || probeError || probeResponse) && (
              <div
                data-testid="probe-models-summary"
                className={`border rounded-md px-3.5 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  probeError
                    ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                    : isProbingModels
                    ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                    : availableProbedModels.length > 0
                    ? 'bg-emerald-50/60 border-emerald-200 text-slate-800'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                {isProbingModels ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                    <span>
                      正在绕开级联回退，并行向 Google Gemini API 发送真实探测请求（常规模型限时 20s，Hydrogen 不设短超时以实测真实耗时，不计入科研 Token 账单）...
                    </span>
                  </div>
                ) : probeError ? (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>连通性检测失败：{probeError}</span>
                  </div>
                ) : probeResponse ? (
                  <>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
                        <span
                          className={
                            availableProbedModels.length > 0
                              ? 'text-emerald-700 font-semibold'
                              : 'text-amber-800 font-semibold'
                          }
                        >
                          {availableProbedModels.length > 0
                            ? `● 实测可直连：${availableProbedModels.length}/${probeResponse.results.length} 个模型`
                            : `▲ 当前 Key 暂无可直连模型（0/${probeResponse.results.length}）`}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono-tabular text-[11px] text-slate-600">
                          检测时间{' '}
                          {new Date(probeResponse.checkedAt).toLocaleTimeString('zh-CN', {
                            hour12: false,
                          })}
                        </span>
                        {availableProbedModels.length > 0 && (
                          <>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-[11px] text-slate-700">
                              可用：
                              {availableProbedModels
                                .map(
                                  (m) =>
                                    `${GEMINI_MODEL_PROFILES[m.model].shortName} (${formatProbeLatency(
                                      m.latencyMs
                                    )})`
                                )
                                .join('、')}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {!probeResponse.hasGeminiKey
                          ? '服务端未配置有效的 GEMINI_API_KEY，请在 Settings > Secrets 中绑定密钥后重新检测。'
                          : probeResponse.results.some((r) => r.status === 'paid_or_quota_429')
                          ? '标示「429 需付费 Key」的模型已确认接入官方接口，绑定开启结算（Billing）的 API Key（Settings > Secrets）即可直连。'
                          : '所有模型已通过当前 API Key 实时探测完成，点击下方卡片可直接切换。'}
                      </p>
                    </div>
                    {availableProbedModels.length > 0 &&
                      !probeResultByModel.get(preferredModel)?.ok && (
                        <button
                          type="button"
                          data-testid="switch-to-fastest-available"
                          onClick={() => onChangePreferredModel(availableProbedModels[0].model)}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                        >
                          一键切至可用模型 ({GEMINI_MODEL_PROFILES[availableProbedModels[0].model].shortName})
                        </button>
                      )}
                  </>
                ) : null}
              </div>
            )}

            {/* Task & Token Budget Model Recommendation Component */}
            <ModelRecommendationCard
              taskType={selectedTaskType}
              onChangeTaskType={setSelectedTaskType}
              recommendation={recommendation}
              onApplyRecommendedModel={onChangePreferredModel}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(
                [
                  'gemini-4-hydrogen',
                  'gemini-4-neon',
                  'gemini-4-carbon',
                  'gemini-4-argon',
                  'gemini-3.1-flash-lite',
                ] as SelectableGeminiModel[]
              ).map((modelKey) => {
                const profile = GEMINI_MODEL_PROFILES[modelKey];
                const quotaStat = officialModelQuotas.find((q) => q.model === modelKey)!;
                const probeStat = probeResultByModel.get(modelKey);
                const isSelected = preferredModel === modelKey;
                const isDeepReasoningPro =
                  modelKey === 'gemini-4-neon' ||
                  modelKey === 'gemini-4-carbon' ||
                  modelKey === 'gemini-4-argon';
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
                          {isDeepReasoningPro ? (
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
                      {probeStat ? (
                        <div
                          data-testid={`probe-status-${modelKey}`}
                          title={probeStat.detailZh}
                          className={`pt-1 border-t border-slate-100 font-mono-tabular text-[11px] leading-snug ${
                            probeStat.ok
                              ? 'text-emerald-700 font-semibold'
                              : probeStat.status === 'paid_or_quota_429' ||
                                probeStat.status === 'timeout'
                              ? 'text-amber-800 font-medium'
                              : 'text-rose-700 font-medium'
                          }`}
                        >
                          {probeStat.ok ? '● ' : probeStat.status === 'paid_or_quota_429' || probeStat.status === 'timeout' ? '▲ ' : '✕ '}
                          {probeStat.statusLabelZh}
                          {probeStat.latencyMs > 0 ? ` · ${formatProbeLatency(probeStat.latencyMs)}` : ''}
                        </div>
                      ) : (
                        accountTier === 'free' &&
                        profile.freeTierWarningZh && (
                          <div
                            data-testid={`model-warning-${modelKey}`}
                            className="text-[11px] font-medium text-amber-800 pt-0.5"
                          >
                            ▲ {profile.freeTierWarningZh}
                          </div>
                        )
                      )}
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

            {/* Unified 3-Model Official Quota Comparison Matrix (Single Source of Truth) */}
            <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">模型</th>
                    <th className="py-2.5 px-3 font-medium">RPD（今日已用 / 官方上限）</th>
                    <th className="py-2.5 px-3 font-medium text-right">RPM（60秒 / 上限）</th>
                    <th className="py-2.5 px-3 font-medium text-right">TPM（60秒 / 上限）</th>
                    <th className="py-2.5 px-3 font-medium text-right">状态 / 操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-tabular">
                  {officialModelQuotas.map((row) => {
                    const isCurrent = row.model === preferredModel;
                    const remainingRpd = Math.max(0, row.limits.rpd - row.todayRequests);
                    return (
                      <tr
                        key={row.model}
                        data-testid={`quota-matrix-row-${row.model}`}
                        className={isCurrent ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{row.shortName}</span>
                          <span className="text-[11px] font-mono-tabular text-slate-400 ml-1.5">
                            {row.model}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 min-w-[200px]">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span>
                              <span className={row.rpdPercent >= 80 ? 'text-amber-700 font-bold' : 'font-semibold text-slate-900'}>
                                {row.todayRequests.toLocaleString()}
                              </span>{' '}
                              / {row.limits.rpd.toLocaleString()} ({row.rpdPercent}%)
                            </span>
                            <span className="text-[11px] text-slate-500">
                              剩 {remainingRpd.toLocaleString()}
                            </span>
                          </div>
                          <progress
                            value={Math.min(row.todayRequests, row.limits.rpd)}
                            max={row.limits.rpd}
                            className={`w-full h-1.5 mt-1 overflow-hidden rounded-full bg-slate-100 block ${getBarAccentClass(
                              row.rpdPercent
                            )}`}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap">
                          {row.lastMinuteRequests} / {row.limits.rpm.toLocaleString()}
                          <span className="text-[11px] text-slate-400 ml-1">({row.rpmPercent}%)</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap">
                          {formatCompactTokens(row.lastMinuteTokens)} / {formatCompactTokens(row.limits.tpm)}
                          <span className="text-[11px] text-slate-400 ml-1">({row.tpmPercent}%)</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans whitespace-nowrap">
                          {isCurrent ? (
                            <span className="text-[11px] font-semibold text-blue-700">● 当前激活</span>
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

            {/* Compact Budget Progress & Inline Telemetry Strip */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-slate-600 font-mono-tabular pt-0.5">
                <span>
                  今日调用 <strong className="text-slate-900">{summary.todayCalls}</strong> 次（成功 {Math.max(0, summary.todayCalls - summary.todayDegradedCalls)} · 降级 {summary.todayDegradedCalls}）
                </span>
                <span>
                  输入 <strong className="text-slate-900">{summary.todayPromptTokens.toLocaleString()}</strong> tok · 输出 <strong className="text-blue-700">{summary.todayCompletionTokens.toLocaleString()}</strong> tok
                </span>
                <span>
                  平均耗时 <strong className="text-slate-900">{summary.avgLatencyMs > 0 ? `${(summary.avgLatencyMs / 1000).toFixed(1)}s` : '—'}</strong> · 累计 <strong className="text-slate-900">{summary.allTimeTotalTokens.toLocaleString()}</strong> tok
                </span>
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
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
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
                  {accountTier === 'free' ? '免费层级 (Free Tier)' : '付费层级 (Tier 1)'} · 批注{' '}
                  <strong>Lv.{annotationDetailLevel}</strong>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {hasActivePaperForRegen && onRegenerateWithNewLevel && (
              <button
                type="button"
                disabled={isTranslatingFull}
                onClick={async () => {
                  onClose();
                  await onRegenerateWithNewLevel();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTranslatingFull ? 'animate-spin' : ''}`} />
                <span>
                  {isTranslatingFull
                    ? '正在重新生成...'
                    : `应用 Lv.${annotationDetailLevel} 重译当前论文`}
                </span>
              </button>
            )}
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
    </div>
  );
};

import React from 'react';
import { Lightbulb, AlertTriangle, CheckCircle2, ArrowRight, Zap } from 'lucide-react';
import type { SelectableGeminiModel } from '../types/physics';
import {
  QUOTA_TASK_PROFILES,
  type ModelRecommendationResult,
  type QuotaTaskType,
} from '../utils/quotaTracker';

interface ModelRecommendationCardProps {
  taskType: QuotaTaskType;
  onChangeTaskType: (taskType: QuotaTaskType) => void;
  recommendation: ModelRecommendationResult;
  onApplyRecommendedModel: (model: SelectableGeminiModel) => void;
}

const TASK_ORDER: QuotaTaskType[] = [
  'knowledge_retrieval',
  'paper_preanalysis',
  'full_translation',
  'deep_derivation',
];

export const ModelRecommendationCard: React.FC<ModelRecommendationCardProps> = ({
  taskType,
  onChangeTaskType,
  recommendation,
  onApplyRecommendedModel,
}) => {
  const {
    budgetStatus,
    budgetStatusLabelZh,
    recommendedModel,
    recommendedShortName,
    peakUtilizationPercent,
    remainingDailyTokens,
    headlineZh,
    rationaleZh,
    efficiencyHintZh,
    shouldPromptSwitch,
    isFlashLiteSuggestion,
  } = recommendation;

  const isTightOrCritical = budgetStatus === 'tight' || budgetStatus === 'critical';

  const containerToneClass =
    budgetStatus === 'critical'
      ? 'bg-rose-50/55 border-rose-300'
      : budgetStatus === 'tight'
      ? 'bg-amber-50/55 border-amber-300'
      : 'bg-slate-50/80 border-slate-200';

  const statusTextClass =
    budgetStatus === 'critical'
      ? 'text-rose-700'
      : budgetStatus === 'tight'
      ? 'text-amber-800'
      : 'text-emerald-700';

  return (
    <div
      data-testid="model-recommendation-card"
      data-budget-status={budgetStatus}
      data-recommended-model={recommendedModel}
      className={`border rounded-lg p-4 space-y-3 transition-colors ${containerToneClass}`}
    >
      {/* Top Row: Title + Budget Status + Task Type Segmented Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
            {isTightOrCritical ? (
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  budgetStatus === 'critical' ? 'text-rose-600' : 'text-amber-600'
                }`}
              />
            ) : (
              <Lightbulb className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>推荐模型建议</span>
          </div>
          <span className="text-slate-300" aria-hidden="true">
            ·
          </span>
          <span
            data-testid="recommendation-budget-status"
            className={`text-xs font-mono-tabular font-semibold ${statusTextClass}`}
          >
            {budgetStatusLabelZh}
          </span>
          <span className="text-slate-300" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] font-mono-tabular text-slate-600">
            峰值占用 {peakUtilizationPercent}% · 今日剩余 {remainingDailyTokens.toLocaleString()} tok
          </span>
        </div>

        {/* Task Type Segmented Control */}
        <div
          role="group"
          aria-label="选择当前科研任务类型以获取模型推荐"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-md self-start lg:self-auto"
        >
          {TASK_ORDER.map((id) => {
            const task = QUOTA_TASK_PROFILES[id];
            const active = taskType === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`rec-task-${id}`}
                onClick={() => onChangeTaskType(id)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {task.shortLabelZh}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recommendation Body & One-Click Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
        <div className="space-y-1 flex-1 min-w-0">
          <div
            data-testid="recommendation-headline"
            className="text-xs font-bold text-slate-900 leading-snug"
          >
            {headlineZh}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{rationaleZh}</p>
          <div className="text-[11px] font-mono-tabular text-slate-500 pt-0.5">
            {efficiencyHintZh}
          </div>
        </div>

        <div className="shrink-0 flex items-center">
          {shouldPromptSwitch ? (
            <button
              type="button"
              data-testid="apply-recommended-model"
              onClick={() => onApplyRecommendedModel(recommendedModel)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isTightOrCritical && isFlashLiteSuggestion
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {isFlashLiteSuggestion
                  ? '切换至轻量级 Flash-Lite'
                  : `切换至 ${recommendedShortName}`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div
              data-testid="recommendation-already-active"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-white border border-emerald-200 rounded-md whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>已启用推荐模型 ({recommendedShortName})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

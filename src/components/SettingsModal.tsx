import React from 'react';
import { AnnotationDetailLevel } from '../types/physics';
import {
  ANNOTATION_DETAIL_PROFILES,
  DEFAULT_ANNOTATION_DETAIL_LEVEL,
  getAnnotationDetailProfile,
  normalizeAnnotationDetailLevel,
} from '../utils/annotationSettings';
import { LatexBlock, MixedAcademicText } from './LatexRenderer';
import { X, SlidersHorizontal, RotateCcw, RefreshCw, Sparkles, BookOpen } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  annotationDetailLevel: AnnotationDetailLevel;
  onChangeAnnotationDetailLevel: (level: AnnotationDetailLevel) => void;
  onClose: () => void;
  hasActivePaperForRegen?: boolean;
  isTranslatingFull?: boolean;
  onRegenerateWithNewLevel?: () => Promise<void>;
}

const LEVELS: AnnotationDetailLevel[] = [1, 2, 3, 4, 5];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  annotationDetailLevel,
  onChangeAnnotationDetailLevel,
  onClose,
  hasActivePaperForRegen = false,
  isTranslatingFull = false,
  onRegenerateWithNewLevel,
}) => {
  if (!isOpen) return null;

  const activeProfile = getAnnotationDetailProfile(annotationDetailLevel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base font-bold text-slate-900">
                全局设置 · 批注详细程度与推导深度调节
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                根据您当前的理论物理学术水平，全局调节 Gemini 生成批注的深度与公式推导的冗长程度。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置窗口"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 bg-slate-50/60">
          {/* Main Slider Card */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label
                  htmlFor="annotation-detail-slider"
                  className="text-sm font-bold text-slate-900 block"
                >
                  批注详细程度（全局生效）
                </label>
                <span className="text-xs text-slate-500">
                  滑动或点击下方档位，实时调整批注密度与公式展开颗粒度
                </span>
              </div>
              <div
                data-testid="settings-detail-badge"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs font-mono-tabular font-semibold self-start sm:self-auto"
              >
                <span>Lv.{activeProfile.level} / 5</span>
                <span>·</span>
                <span>{activeProfile.shortLabel}</span>
              </div>
            </div>

            {/* Range Slider */}
            <div className="space-y-3">
              <input
                id="annotation-detail-slider"
                type="range"
                min={1}
                max={5}
                step={1}
                value={annotationDetailLevel}
                aria-valuetext={`Lv.${activeProfile.level} ${activeProfile.shortLabel}：${activeProfile.academicProfile}`}
                onChange={(e) =>
                  onChangeAnnotationDetailLevel(
                    normalizeAnnotationDetailLevel(Number(e.target.value))
                  )
                }
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />

              {/* 5 Step Quick-Select Buttons */}
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.map((lvl) => {
                  const prof = ANNOTATION_DETAIL_PROFILES[lvl];
                  const isActive = lvl === annotationDetailLevel;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => onChangeAnnotationDetailLevel(lvl)}
                      aria-pressed={isActive}
                      className={`px-2 py-2 rounded-md border text-center transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="text-[11px] font-mono-tabular font-semibold">
                        Lv.{lvl}
                      </div>
                      <div className="text-xs font-medium mt-0.5 truncate">
                        {prof.shortLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Profile Breakdown */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 text-xs">
                <span className="font-semibold text-slate-900">
                  适用学术水平：{activeProfile.academicProfile}
                </span>
                <span className="font-mono-tabular text-blue-700 font-medium">
                  推导粒度：{activeProfile.derivationStepHint}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-800">批注深度策略</div>
                  <p className="text-slate-600">
                    <MixedAcademicText text={activeProfile.annotationDepthSummary} />
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-slate-800">公式推导冗长程度</div>
                  <p className="text-slate-600">
                    <MixedAcademicText text={activeProfile.derivationVerbositySummary} />
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Live Effect Preview */}
          <section
            data-testid="settings-detail-preview"
            className="bg-white border border-slate-200 rounded-lg p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>生成效果对照预览（以「单圈有效作用量」推导为例）</span>
              </div>
              <span className="text-[11px] font-mono-tabular text-slate-500">
                含 {activeProfile.previewSample.steps.length} 个展开节点
              </span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3 text-xs">
              <div className="font-bold text-slate-900">
                {activeProfile.previewSample.conceptHeader}
              </div>
              <div className="text-slate-700 leading-relaxed">
                <MixedAcademicText text={activeProfile.previewSample.explanationText} />
              </div>
              <div className="space-y-2 pt-1">
                {activeProfile.previewSample.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-white border border-slate-200 rounded space-y-1.5"
                  >
                    <div className="font-mono-tabular font-semibold text-slate-800">
                      {step.label}
                    </div>
                    {step.latex && <LatexBlock latex={step.latex} displayMode={true} />}
                    <div className="text-slate-600">
                      <MixedAcademicText text={step.text} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Global Scope Notice */}
          <section className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2 text-xs text-slate-700">
            <div className="font-semibold text-blue-950 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>该设置全局作用于以下所有 Gemini 学术引擎：</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 list-disc pl-4 text-slate-700">
              <li>2. 论文预分析与逐章缺口批注数量规划</li>
              <li>3. 纯中文论文深度翻译与五类精准批注</li>
              <li>3. 复杂公式「数学推导思维导图」树状展开</li>
              <li>3. Gemini 伴读导师问答与「追问推导细节」</li>
            </ul>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <button
            type="button"
            onClick={() => onChangeAnnotationDetailLevel(DEFAULT_ANNOTATION_DETAIL_LEVEL)}
            disabled={annotationDetailLevel === DEFAULT_ANNOTATION_DETAIL_LEVEL}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-45 rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复默认 (Lv.3 标准学术)</span>
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasActivePaperForRegen && onRegenerateWithNewLevel && (
              <button
                type="button"
                disabled={isTranslatingFull}
                onClick={async () => {
                  onClose();
                  await onRegenerateWithNewLevel();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTranslatingFull ? 'animate-spin' : ''}`} />
                <span>
                  {isTranslatingFull
                    ? '正在重新生成...'
                    : `应用 Lv.${annotationDetailLevel} 重新生成当前论文批注`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors cursor-pointer"
            >
              保存并关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

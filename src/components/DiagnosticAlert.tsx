import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { GenerationMeta } from '../types/physics';

interface DiagnosticAlertProps {
  variant?: 'degraded' | 'error';
  title?: string;
  message: string;
  meta?: GenerationMeta;
  retryLabel?: string;
  isRetrying?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const DiagnosticAlert: React.FC<DiagnosticAlertProps> = ({
  variant = 'degraded',
  title,
  message,
  meta,
  retryLabel = '立即重试',
  isRetrying = false,
  onRetry,
  className = '',
}) => {
  const isError = variant === 'error';
  const glyph = isError ? '◆' : '▲';
  const containerClasses = isError
    ? 'bg-rose-50/75 border-rose-300 text-rose-950'
    : 'bg-amber-50/75 border-amber-300 text-amber-950';
  const glyphColor = isError ? 'text-rose-700' : 'text-amber-700';
  const buttonClasses = isError
    ? 'bg-white border-rose-300 text-rose-900 hover:bg-rose-100/70'
    : 'bg-white border-amber-300 text-amber-950 hover:bg-amber-100/70';

  return (
    <div
      role="alert"
      className={`border rounded-md px-3.5 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${containerClasses} ${className}`}
    >
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          <span aria-hidden="true" className={glyphColor}>
            {glyph}
          </span>
          <span>{title || (isError ? '请求执行异常' : 'Gemini 实时生成已降级')}</span>
          {meta?.errorCode && (
            <span className="font-mono-tabular text-[11px] font-normal opacity-80">
              [{meta.errorCode}]
            </span>
          )}
        </div>
        <div className="leading-relaxed opacity-90">{message}</div>
      </div>

      {onRetry && (
        <button
          type="button"
          disabled={isRetrying}
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded font-medium text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${buttonClasses}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{isRetrying ? '正在重试...' : retryLabel}</span>
        </button>
      )}
    </div>
  );
};

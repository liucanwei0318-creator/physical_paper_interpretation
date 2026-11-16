import React from 'react';
import { AlertTriangle, RefreshCw, Download, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onAutoRepairAndReset?: () => void;
  onExportBackup?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : '页面组件渲染时遇到异常数据结构';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('[PhysicaAnnotate ErrorBoundary]', error, errorInfo);
  }

  handleRepair = () => {
    this.props.onAutoRepairAndReset?.();
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section
        role="alert"
        data-testid="error-boundary-fallback"
        className="bg-white border border-amber-300 rounded-lg p-6 sm:p-8 max-w-3xl mx-auto my-8 space-y-5 shadow-xs"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-mono-tabular text-amber-800 font-semibold">
              安全容错边界已拦截渲染异常 · 您的论文翻译与阅读进度完好无损
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              {this.props.fallbackTitle || '当前视图包含部分非标准模型返回字段，已自动隔离'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              系统检测到大模型返回的部分章节 JSON 结构存在缺失字段（诊断信息：
              <code className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs mx-1">
                {this.state.errorMessage}
              </code>
              ）。您无需刷新或重新翻译，点击下方按钮即可自动修复缺失数组并恢复正常阅读。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={this.handleRepair}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>一键自动修复数据结构并继续阅读</span>
          </button>

          {this.props.onExportBackup && (
            <button
              type="button"
              onClick={this.props.onExportBackup}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载当前已译 Markdown 备份文稿</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>直接重试渲染</span>
          </button>
        </div>
      </section>
    );
  }
}

import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Download, FileCode2, FileText, BookMarked } from 'lucide-react';
import type {
  KnowledgeAnalysisReport,
  KnowledgeNode,
  PaperPreAnalysis,
  TranslatedPaperDocument,
} from '../types/physics';
import { exportAcademicMarkdown } from '../utils/knowledgeEngine';
import { exportAcademicBibtex, exportAcademicLatex } from '../utils/academicExport';

export type AcademicExportFormat = 'markdown' | 'latex' | 'bibtex';

interface AcademicExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: TranslatedPaperDocument | null;
  knowledgeNodes: KnowledgeNode[];
  report: KnowledgeAnalysisReport | null;
  preAnalysis: PaperPreAnalysis | null;
}

const FORMAT_META: Record<
  AcademicExportFormat,
  {
    label: string;
    ext: string;
    mime: string;
    copyLabel: string;
    copiedLabel: string;
    downloadLabel: string;
    subtitle: string;
  }
> = {
  markdown: {
    label: 'Markdown (.md)',
    ext: 'md',
    mime: 'text/markdown;charset=utf-8',
    copyLabel: '复制 Markdown 源码',
    copiedLabel: '已复制 Markdown',
    downloadLabel: '下载 .md 批注文稿',
    subtitle: '已自动剔除您掌握的 K1 基础知识冗余批注，保留 LaTeX 数学公式与 K2–K4 深度解析。',
  },
  latex: {
    label: 'LaTeX 源码 (.tex)',
    ext: 'tex',
    mime: 'application/x-tex;charset=utf-8',
    copyLabel: '复制 LaTeX 源码',
    copiedLabel: '已复制 LaTeX',
    downloadLabel: '下载 .tex 学术文稿',
    subtitle: '生成适配 XeLaTeX + ctexart 的完整中文学术排版源码，自动保护数学公式并转义正文特殊符号。',
  },
  bibtex: {
    label: 'BibTeX 引文 (.bib)',
    ext: 'bib',
    mime: 'application/x-bibtex;charset=utf-8',
    copyLabel: '复制 BibTeX 引文',
    copiedLabel: '已复制 BibTeX',
    downloadLabel: '下载 .bib 引文库',
    subtitle: '汇总当前精读论文与 arXiv / CrossRef 核验文献的标准 BibTeX 引用条目，可直接导入文献管理器。',
  },
};

export const AcademicExportModal: React.FC<AcademicExportModalProps> = ({
  isOpen,
  onClose,
  document: activeDoc,
  knowledgeNodes,
  report,
  preAnalysis,
}) => {
  const [format, setFormat] = useState<AcademicExportFormat>('markdown');
  const [copiedFormat, setCopiedFormat] = useState<AcademicExportFormat | null>(null);

  const exportedContent = useMemo(() => {
    if (!isOpen) return '';
    if (format === 'latex') {
      return exportAcademicLatex(activeDoc, knowledgeNodes, report, preAnalysis, false);
    }
    if (format === 'bibtex') {
      return exportAcademicBibtex(activeDoc, preAnalysis);
    }
    return exportAcademicMarkdown(activeDoc, knowledgeNodes, report, preAnalysis, false);
  }, [isOpen, format, activeDoc, knowledgeNodes, report, preAnalysis]);

  if (!isOpen) return null;

  const meta = FORMAT_META[format];
  const baseFilename =
    activeDoc?.titleZh || preAnalysis?.titleZh || '理论物理论文中文批注文稿';

  const handleCopy = () => {
    navigator.clipboard.writeText(exportedContent);
    setCopiedFormat(format);
    setTimeout(() => {
      setCopiedFormat((prev) => (prev === format ? null : prev));
    }, 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([exportedContent], { type: meta.mime });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${baseFilename}.${meta.ext}`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[85vh] flex flex-col shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="export-modal-title" className="text-base font-bold text-slate-900">
              导出中文学术翻译与科研引文（Markdown · LaTeX · BibTeX）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <div
              role="group"
              aria-label="选择导出格式"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md"
            >
              <button
                type="button"
                data-testid="export-tab-markdown"
                onClick={() => setFormat('markdown')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  format === 'markdown'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Markdown</span>
              </button>
              <button
                type="button"
                data-testid="export-tab-latex"
                onClick={() => setFormat('latex')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  format === 'latex'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>LaTeX (.tex)</span>
              </button>
              <button
                type="button"
                data-testid="export-tab-bibtex"
                onClick={() => setFormat('bibtex')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  format === 'bibtex'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookMarked className="w-3.5 h-3.5" />
                <span>BibTeX (.bib)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭导出窗口"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto bg-slate-50">
          <pre
            data-testid="export-preview-content"
            className="text-xs font-mono-tabular text-slate-800 whitespace-pre-wrap leading-relaxed bg-white p-4 border border-slate-200 rounded-md"
          >
            {exportedContent}
          </pre>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-white">
          <button
            type="button"
            data-testid="export-copy-btn"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
          >
            {copiedFormat === format ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>{meta.copiedLabel}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{meta.copyLabel}</span>
              </>
            )}
          </button>
          <button
            type="button"
            data-testid="export-download-btn"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{meta.downloadLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

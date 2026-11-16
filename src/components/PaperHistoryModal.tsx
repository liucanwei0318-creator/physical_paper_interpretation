import React, { useState, useMemo } from 'react';
import type {
  ArchivedPaperEntry,
  InProgressTranslationSnapshot,
} from '../types/physics';
import {
  X,
  BookOpen,
  Download,
  Trash2,
  Search,
  Clock,
  CheckCircle2,
  PlayCircle,
  FileText,
} from 'lucide-react';

interface PaperHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  archivedPapers: ArchivedPaperEntry[];
  activePaperId?: string;
  inProgressTranslation?: InProgressTranslationSnapshot | null;
  onSelectPaper: (entry: ArchivedPaperEntry) => void;
  onDeletePaper: (paperId: string) => void;
  onExportPaperMarkdown: (entry: ArchivedPaperEntry) => void;
  onResumeInProgressTranslation?: () => void;
}

export const PaperHistoryModal: React.FC<PaperHistoryModalProps> = ({
  isOpen,
  onClose,
  archivedPapers,
  activePaperId,
  inProgressTranslation,
  onSelectPaper,
  onDeletePaper,
  onExportPaperMarkdown,
  onResumeInProgressTranslation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPapers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return archivedPapers;
    return archivedPapers.filter(
      (p) =>
        p.titleZh.toLowerCase().includes(q) ||
        p.titleEn.toLowerCase().includes(q) ||
        p.authors.toLowerCase().includes(q) ||
        p.arxivIdOrDoi.toLowerCase().includes(q)
    );
  }, [archivedPapers, searchQuery]);

  if (!isOpen) return null;

  const inProgressCompletedCount = inProgressTranslation
    ? inProgressTranslation.outcomes.filter(
        (o) => o.status === 'completed' || o.status === 'degraded' || o.status === 'failed'
      ).length
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-history-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[85vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="space-y-0.5">
            <h2 id="paper-history-modal-title" className="text-base font-bold text-slate-900">
              历史精读论文档案库（本地自动归档 · 共 {archivedPapers.length} 篇）
            </h2>
            <p className="text-xs text-slate-500">
              每篇论文的分节翻译进度、K1–K4 精准批注文稿、伴读对话记录与公式推导导图均已自动保存在本地，支持随时一键切换或断点续译。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭历史论文库窗口"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unfinished / In-Progress Translation Banner */}
        {inProgressTranslation &&
          inProgressCompletedCount < inProgressTranslation.chunks.length && (
            <div className="mx-6 mt-4 p-4 bg-blue-50/80 border border-blue-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-blue-950 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    检测到可断点续译的论文：《
                    {inProgressTranslation.titleZh || inProgressTranslation.titleEn}》
                  </span>
                </div>
                <div className="text-slate-600 font-mono-tabular">
                  已保存进度：{inProgressCompletedCount} / {inProgressTranslation.chunks.length} 节 ·
                  上次更新：{new Date(inProgressTranslation.updatedAt).toLocaleString('zh-CN')}
                </div>
              </div>
              {onResumeInProgressTranslation && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onResumeInProgressTranslation();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>
                    从第 {inProgressCompletedCount + 1} 节继续翻译
                  </span>
                </button>
              )}
            </div>
          )}

        {/* Search Filter Bar */}
        <div className="px-6 pt-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索已保存论文的中文标题、英文标题、作者或 arXiv 编号..."
              aria-label="搜索历史精读论文"
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {/* Paper List */}
        <div className="px-6 py-3 flex-1 overflow-y-auto space-y-3">
          {filteredPapers.length === 0 ? (
            <div className="border border-slate-200 bg-slate-50/70 rounded-lg p-10 text-center space-y-2.5 my-4">
              <div className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-600 flex items-center justify-center mx-auto">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {archivedPapers.length === 0
                  ? '暂无已归档的历史翻译论文'
                  : '未找到匹配搜索关键词的历史论文'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                当您在「2. 论文预分析与缺口」中确认并开始全文翻译时，每译完一节系统都会自动将文稿实时归档至此，方便您随时切换审阅多篇文献。
              </p>
            </div>
          ) : (
            filteredPapers.map((entry) => {
              const isCurrent = entry.paperId === activePaperId;
              const isComplete = entry.completedChunks >= entry.totalChunks;

              return (
                <article
                  key={entry.paperId}
                  data-testid={`archived-paper-${entry.paperId}`}
                  className={`p-4 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isCurrent
                      ? 'bg-blue-50/30 border-blue-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-semibold">
                          当前正在阅读
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isComplete ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          已译 {entry.completedChunks} / {entry.totalChunks} 节
                        </span>
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">
                        详略 Lv.{entry.annotationDetailLevel}
                      </span>
                      {entry.arxivIdOrDoi && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 truncate max-w-[200px]">
                            {entry.arxivIdOrDoi}
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                      {entry.titleZh}
                    </h3>

                    <div className="text-xs text-slate-500 truncate">
                      {entry.titleEn} {entry.authors ? `— ${entry.authors}` : ''}
                    </div>

                    <div className="text-[11px] font-mono-tabular text-slate-400">
                      保存时间：{new Date(entry.savedAt).toLocaleString('zh-CN')} · 共{' '}
                      {entry.document.sections.reduce(
                        (acc, s) => acc + (s.paragraphs?.length || 0),
                        0
                      )}{' '}
                      个自然段 · {entry.document.terminologyTable?.length || 0} 条核心术语
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPaper(entry);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{isCurrent ? '返回阅读此文稿' : '加载并阅读此文稿'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onExportPaperMarkdown(entry)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-md transition-colors cursor-pointer"
                      title="直接下载该篇论文的 Markdown + LaTeX 批注文稿"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>导出 .md</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeletePaper(entry.paperId)}
                      aria-label={`从历史记录中删除《${entry.titleZh}》`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      title="从历史档案库中移除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 rounded-b-lg">
          <span>最多自动保留最近精读的 15 篇理论物理论文档案</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-medium rounded-md transition-colors cursor-pointer"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </div>
  );
};

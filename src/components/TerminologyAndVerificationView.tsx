import React, { useState, useMemo, useRef } from 'react';
import {
  TranslatedPaperDocument,
  DynamicFeedbackEvent,
  KnowledgeNode,
  KnowledgeLevel,
} from '../types/physics';
import { auditTerminologyConsistency } from '../utils/knowledgeEngine';
import {
  buildTerminologyCloudItems,
  filterTerminologyCloudItems,
  TerminologyCloudItem,
} from '../utils/terminologyCloud';
import { ArxivRelatedPaper } from '../utils/arxivParser';
import { MixedAcademicText } from './LatexRenderer';
import {
  ExternalLink,
  CheckCircle2,
  Search,
  RefreshCw,
  BookOpen,
  FileText,
  Send,
  MessageSquare,
} from 'lucide-react';
import type { GenerationMeta } from '../types/physics';
import { DiagnosticAlert } from './DiagnosticAlert';

interface TerminologyAndVerificationViewProps {
  document: TranslatedPaperDocument;
  feedbackHistory: DynamicFeedbackEvent[];
  knowledgeNodes: KnowledgeNode[];
}

interface ArxivTermSearchResult {
  termZh: string;
  termEn: string;
  searchQueryUsed: string;
  backgroundGuideZh: string;
  papers: ArxivRelatedPaper[];
}

function getCloudTermColorClass(level: KnowledgeLevel, isSelected: boolean): string {
  if (isSelected) {
    return 'bg-blue-600 text-white shadow-xs';
  }
  switch (level) {
    case 'K4':
      return 'text-blue-700 hover:bg-blue-50 hover:text-blue-900';
    case 'K3':
      return 'text-amber-700 hover:bg-amber-50 hover:text-amber-900';
    case 'K2':
      return 'text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900';
    case 'K1':
    default:
      return 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900';
  }
}

export const TerminologyAndVerificationView: React.FC<TerminologyAndVerificationViewProps> = ({
  document,
  feedbackHistory,
  knowledgeNodes,
}) => {
  const [doiQuery, setDoiQuery] = useState('');
  const [isVerifyingDoi, setIsVerifyingDoi] = useState(false);
  const [doiError, setDoiError] = useState<string | null>(null);
  const [doiResult, setDoiResult] = useState<{
    query: string;
    synthesis: string;
    sources: Array<{ title: string; uri: string; sourceType: string; snippet?: string }>;
    generationMeta?: GenerationMeta;
  } | null>(null);

  // Word Cloud & arXiv Linked Background Supplement State
  const [cloudLevelFilter, setCloudLevelFilter] = useState<'ALL' | KnowledgeLevel>('ALL');
  const [selectedCloudItem, setSelectedCloudItem] = useState<TerminologyCloudItem | null>(null);
  const [isSearchingArxivTerm, setIsSearchingArxivTerm] = useState(false);
  const [arxivTermError, setArxivTermError] = useState<string | null>(null);
  const [arxivTermResult, setArxivTermResult] = useState<ArxivTermSearchResult | null>(null);
  const arxivCacheRef = useRef<Record<string, ArxivTermSearchResult>>({});
  const cloudSectionRef = useRef<HTMLElement | null>(null);

  // Interactive Term Guide Q&A state
  const [termGuideQuestion, setTermGuideQuestion] = useState('');
  const [isAskingTermGuide, setIsAskingTermGuide] = useState(false);
  const [termGuideAnswers, setTermGuideAnswers] = useState<
    Record<string, Array<{ question: string; answer: string }>>
  >({});

  const handleAskTermGuide = async (customQuestion?: string) => {
    if (!selectedCloudItem || isAskingTermGuide) return;
    const q = (customQuestion ?? termGuideQuestion).trim();
    if (!q) return;

    setIsAskingTermGuide(true);
    try {
      const resp = await fetch('/api/paper-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: q,
          chatHistory: [],
          activeLocation: {
            sectionNumber: selectedCloudItem.firstAppearanceSection || '1',
            sectionTitleZh: `核心术语导读：${selectedCloudItem.termZh}`,
            sectionTitleEn: selectedCloudItem.termEn,
            paragraphId: `term-${selectedCloudItem.id}`,
            paragraphIndex: 1,
            statementType: '关键定义',
            translatedZhText:
              arxivTermResult?.backgroundGuideZh ||
              selectedCloudItem.definitionSummary ||
              `${selectedCloudItem.termZh} (${selectedCloudItem.termEn})`,
            originalEnExcerpt: selectedCloudItem.termEn,
            equations: [],
          },
          documentContext: {
            titleZh: document.titleZh,
            titleEn: document.titleEn,
            authors: document.authors,
            abstractZh: document.abstractZh,
            allSectionTitles: document.sections.map((s) => `${s.sectionNumber} ${s.titleZh}`),
          },
          knowledgeNodes,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '术语导读提问失败');
      }
      setTermGuideAnswers((prev) => ({
        ...prev,
        [selectedCloudItem.id]: [
          ...(prev[selectedCloudItem.id] || []),
          {
            question: q,
            answer: data.replyMarkdown || '已完成针对该术语的导读解析。',
          },
        ],
      }));
      if (!customQuestion) setTermGuideQuestion('');
    } catch (err) {
      setArxivTermError(err instanceof Error ? err.message : '术语导读助手请求失败');
    } finally {
      setIsAskingTermGuide(false);
    }
  };

  const audit = auditTerminologyConsistency(document);

  const allCloudItems = useMemo(
    () => buildTerminologyCloudItems(document, knowledgeNodes),
    [document, knowledgeNodes]
  );

  const visibleCloudItems = useMemo(
    () => filterTerminologyCloudItems(allCloudItems, cloudLevelFilter),
    [allCloudItems, cloudLevelFilter]
  );

  const topFrequencyItems = useMemo(
    () => [...allCloudItems].sort((a, b) => b.frequency - a.frequency).slice(0, 3),
    [allCloudItems]
  );

  const handleSelectCloudTerm = async (
    item: TerminologyCloudItem,
    scrollIntoView: boolean = false
  ) => {
    setSelectedCloudItem(item);
    setArxivTermError(null);

    if (scrollIntoView && cloudSectionRef.current) {
      cloudSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const cacheKey = `${document.paperId}::${item.termEn.toLowerCase()}::${item.termZh}`;
    const cached = arxivCacheRef.current[cacheKey];
    if (cached) {
      setArxivTermResult(cached);
      return;
    }

    setIsSearchingArxivTerm(true);
    try {
      const resp = await fetch('/api/arxiv-term-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termZh: item.termZh,
          termEn: item.termEn,
          excludeArxivId: document.arxivIdOrDoi,
          paperTitleZh: document.titleZh,
          knowledgeLevel: item.knowledgeLevel,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'arXiv 关联论文检索失败');
      }
      arxivCacheRef.current[cacheKey] = data;
      setArxivTermResult(data);
    } catch (err) {
      setArxivTermError(
        err instanceof Error ? err.message : '检索 arXiv 数据库时发生网络异常'
      );
      setArxivTermResult(null);
    } finally {
      setIsSearchingArxivTerm(false);
    }
  };

  const runDoiVerification = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) {
      setDoiError('请输入需要核验的文献标题、作者姓名、arXiv 编号或 DOI。');
      return;
    }
    setDoiError(null);
    setIsVerifyingDoi(true);
    try {
      const resp = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: clean, searchMode: 'paper' }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '联网核验文献失败，请稍后重试。');
      }
      setDoiResult(data);
    } catch (err) {
      setDoiError(err instanceof Error ? err.message : '联网核验请求异常，请检查网络后重试。');
    } finally {
      setIsVerifyingDoi(false);
    }
  };

  const handleVerifyDoi = async (e: React.FormEvent) => {
    e.preventDefault();
    await runDoiVerification(doiQuery);
  };

  return (
    <div className="space-y-8">
      {/* Stage 7 & 8 Overview Header */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-3xl">
            <div className="text-xs font-mono-tabular text-slate-500">
              第七、八阶段 · 专业术语统一对照、高频术语词云拓展与文献真实性核验中心
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              全文专业术语规范表与学术资料核验中心
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              严格检查首次出现术语「中文术语（English Term）」规范与后续一致性，通过高频物理术语词云一键检索 arXiv 关联论文作为背景补充，核实所有引用文献的真实 DOI 与 arXiv 编号，并记录每一次动态知识层级调整。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-100">
            <div>
              <div className="text-xs font-mono-tabular text-slate-500">已统一核心术语</div>
              <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-0.5">
                {audit.totalTerms}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono-tabular text-slate-500">已核验权威文献</div>
              <div className="text-2xl font-bold font-mono-tabular text-emerald-700 mt-0.5">
                {document.citations.length}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono-tabular text-slate-500">动态反馈调整</div>
              <div className="text-2xl font-bold font-mono-tabular text-blue-700 mt-0.5">
                {feedbackHistory.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* High-Frequency Physics Terminology Word Cloud & Linked arXiv Background Supplement */}
      <section
        ref={cloudSectionRef}
        aria-label="高频物理术语词云与 arXiv 关联论文补充"
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              高频物理术语词云与 arXiv 背景文献联动检索
            </h2>
            <p className="text-xs text-slate-500">
              字号与粗细根据术语在《{document.titleZh}》正文及批注中的出现频次与核心权重计算；点击任意术语即可联动检索 arXiv 数据库中的其他相关论文。
            </p>
          </div>

          <div
            role="group"
            aria-label="按知识层级筛选术语词云"
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md shrink-0"
          >
            {(
              [
                { id: 'ALL', label: `全部术语 (${allCloudItems.length})` },
                { id: 'K4', label: 'K4 原创' },
                { id: 'K3', label: 'K3 缺口' },
                { id: 'K2', label: 'K2 相关' },
                { id: 'K1', label: 'K1 基础' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCloudLevelFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cloudLevelFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left 5 Cols: Typographic High-Frequency Physics Word Cloud */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
            <div
              data-testid="terminology-word-cloud"
              className="flex-1 bg-slate-50/80 border border-slate-200 rounded-md p-6 min-h-[260px] flex flex-wrap items-baseline justify-center content-center gap-x-4 gap-y-3"
            >
              {visibleCloudItems.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  {allCloudItems.length === 0
                    ? '当前文稿尚未提取到足够的高频物理术语。'
                    : `当前筛选层级（${cloudLevelFilter}）下暂无术语，请切换至「全部术语」。`}
                </div>
              ) : (
                visibleCloudItems.map((item) => {
                  const isSelected = selectedCloudItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectCloudTerm(item)}
                      aria-pressed={isSelected}
                      aria-label={`检索术语「${item.termZh} (${item.termEn})」的 arXiv 相关论文，全文出现 ${item.frequency} 次`}
                      style={{
                        fontSize: `${item.fontSizePx}px`,
                        fontWeight: item.fontWeight,
                        lineHeight: 1.35,
                      }}
                      className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${getCloudTermColorClass(
                        item.knowledgeLevel,
                        isSelected
                      )}`}
                      title={`${item.termZh}（${item.termEn}）· 全文 ${item.frequency} 次 · ${item.knowledgeLevel}`}
                    >
                      <span>{item.termZh}</span>
                      <span
                        className={`text-[11px] font-mono-tabular ${
                          isSelected ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {item.frequency}×
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono-tabular px-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-blue-700 font-medium">K4 论文原创</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 font-medium">K3 知识缺口</span>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-700 font-medium">K2 相关接触</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-700 font-medium">K1 已知基础</span>
              </div>
              <span>角标 N× 为全文出现频次</span>
            </div>
          </div>

          {/* Right 7 Cols: Linked arXiv Related Papers Panel */}
          <div
            data-testid="arxiv-term-results"
            className="lg:col-span-7 bg-slate-50/50 border border-slate-200 rounded-md p-5 flex flex-col justify-between space-y-4"
          >
            {!selectedCloudItem ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="text-sm font-semibold text-slate-900">
                    点击左侧词云中的任意物理术语，检索 arXiv 关联文献
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    系统将自动以规范英文术语向 arXiv 官方数据库发起检索（并自动排除当前精读论文自身），为您筛选综述与相关前沿论文作为背景补充。
                  </p>
                </div>
                {topFrequencyItems.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <span className="text-xs text-slate-500">高频术语快速检索：</span>
                    {topFrequencyItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectCloudTerm(item)}
                        className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {item.termZh} ({item.frequency}×)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selected Term Header */}
                <div className="pb-3 border-b border-slate-200 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">
                      {selectedCloudItem.termZh}
                      {selectedCloudItem.termEn && (
                        <span className="font-mono-tabular font-normal text-slate-600 ml-1">
                          （{selectedCloudItem.termEn}）
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono-tabular text-slate-500">
                      <span>频次：{selectedCloudItem.frequency} 次</span>
                      <span aria-hidden="true"> · </span>
                      <span>首次出现：{selectedCloudItem.firstAppearanceSection}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-semibold text-slate-900">
                        {selectedCloudItem.knowledgeLevel}
                      </span>
                    </div>
                  </div>
                  {selectedCloudItem.definitionSummary && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <MixedAcademicText text={selectedCloudItem.definitionSummary} />
                    </p>
                  )}
                </div>

                {/* Loading / Error / Results */}
                {isSearchingArxivTerm && (
                  <div className="py-10 flex items-center justify-center gap-2.5 text-xs text-slate-600">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>
                      正在实时检索 arXiv 数据库中与「{selectedCloudItem.termEn || selectedCloudItem.termZh}」相关的其他论文...
                    </span>
                  </div>
                )}

                {!isSearchingArxivTerm && arxivTermError && (
                  <DiagnosticAlert
                    variant="error"
                    title="arXiv 术语关联检索失败"
                    message={arxivTermError}
                    retryLabel="重试检索"
                    isRetrying={isSearchingArxivTerm}
                    onRetry={() => handleSelectCloudTerm(selectedCloudItem)}
                  />
                )}

                {!isSearchingArxivTerm && arxivTermResult && (
                  <div className="space-y-3.5">
                    <div className="p-3.5 bg-white border border-slate-200 rounded space-y-3 text-xs text-slate-700 leading-relaxed">
                      <div>
                        <span className="font-semibold text-slate-900 mr-1">
                          背景补充导读：
                        </span>
                        <MixedAcademicText text={arxivTermResult.backgroundGuideZh} />
                      </div>

                      {/* Interactive Follow-Up Q&A for Selected Term */}
                      <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-500">
                            向导读助手追问此术语：
                          </span>
                          <button
                            type="button"
                            disabled={isAskingTermGuide}
                            onClick={() =>
                              handleAskTermGuide(
                                `请详细解释「${selectedCloudItem.termZh}（${selectedCloudItem.termEn}）」在本文中的数学定义与核心物理作用。`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3 h-3 text-blue-600" />
                            <span>在本文中的数学定义与作用</span>
                          </button>
                          <button
                            type="button"
                            disabled={isAskingTermGuide}
                            onClick={() =>
                              handleAskTermGuide(
                                `理解「${selectedCloudItem.termZh}」需要哪些教材前置知识？它与我已掌握的 K1 概念有何联系？`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3 h-3 text-blue-600" />
                            <span>所需前置知识与教材衔接</span>
                          </button>
                        </div>

                        {(termGuideAnswers[selectedCloudItem.id] || []).map((qa, qaIdx) => (
                          <div
                            key={qaIdx}
                            className="p-2.5 bg-slate-50 border border-slate-200 rounded space-y-1.5 text-xs"
                          >
                            <div className="font-semibold text-blue-900">
                              追问：{qa.question}
                            </div>
                            <div className="text-slate-800 whitespace-pre-line leading-relaxed">
                              <MixedAcademicText text={qa.answer} />
                            </div>
                          </div>
                        ))}

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAskTermGuide();
                          }}
                          className="flex gap-2"
                        >
                          <label htmlFor="term-guide-qa-input" className="sr-only">
                            向导读助手追问此术语
                          </label>
                          <input
                            id="term-guide-qa-input"
                            type="text"
                            value={termGuideQuestion}
                            onChange={(e) => setTermGuideQuestion(e.target.value)}
                            placeholder={`针对「${selectedCloudItem.termZh}」向 Gemini 导读助手提问...`}
                            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <button
                            type="submit"
                            disabled={isAskingTermGuide || !termGuideQuestion.trim()}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {isAskingTermGuide ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            <span>提问</span>
                          </button>
                        </form>
                      </div>
                    </div>

                    {arxivTermResult.papers.length === 0 ? (
                      <div className="p-4 bg-white border border-slate-200 rounded text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
                        <span>
                          未直接返回其他独立条目，您可以前往 arXiv 官网检索更多文献。
                        </span>
                        <a
                          href={`https://arxiv.org/search/?query=${encodeURIComponent(
                            arxivTermResult.searchQueryUsed
                          )}&searchtype=all`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                        >
                          <span>在 arXiv 官网检索「{arxivTermResult.searchQueryUsed}」</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-md bg-white max-h-[380px] overflow-y-auto">
                        {arxivTermResult.papers.map((paper) => (
                          <article key={paper.arxivId} className="p-3.5 space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                                {paper.title}
                              </h4>
                              <div className="flex items-center gap-2.5 shrink-0 text-xs">
                                <a
                                  href={paper.absUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline whitespace-nowrap"
                                >
                                  <span>摘要页</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={paper.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 hover:underline whitespace-nowrap"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>PDF</span>
                                </a>
                              </div>
                            </div>

                            <div className="text-[11px] font-mono-tabular text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>arXiv:{paper.arxivId}</span>
                              <span aria-hidden="true">·</span>
                              <span>分类：{paper.primaryCategory}</span>
                              {paper.publishedDate && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{paper.publishedDate}</span>
                                </>
                              )}
                              {paper.authors.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate max-w-[260px]">
                                    {paper.authors.slice(0, 3).join(', ')}
                                    {paper.authors.length > 3 ? ' et al.' : ''}
                                  </span>
                                </>
                              )}
                            </div>

                            {paper.abstractSummary && (
                              <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                {paper.abstractSummary}
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Cols: Unified Terminology Table */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              3.1 专业术语首次出现规范与全文统一对照表
            </h2>
            <span className="text-xs font-mono-tabular text-slate-500">
              格式：中文术语（English Term）
            </span>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {document.terminologyTable.map((term, idx) => {
              const matchedCloud = allCloudItems.find(
                (c) =>
                  c.termZh === term.termZh ||
                  c.termEn.toLowerCase() === term.termEn.toLowerCase()
              );

              return (
                <div key={idx} className="p-4 space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="text-sm font-bold text-slate-900">
                      {term.termZh}（<span className="font-mono-tabular font-normal">{term.termEn}</span>）
                    </div>
                    <div className="text-xs font-mono-tabular text-slate-500 flex flex-wrap items-center gap-1.5">
                      <span>首次出现：{term.firstAppearanceSection}</span>
                      <span aria-hidden="true">·</span>
                      <span>分类：{term.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-900">{term.knowledgeLevel}</span>
                      {matchedCloud && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => handleSelectCloudTerm(matchedCloud, true)}
                            className="text-blue-600 hover:underline font-medium cursor-pointer whitespace-nowrap"
                          >
                            检索 arXiv 关联论文
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <MixedAcademicText text={term.definitionSummary} />
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right 5 Cols: Literature & DOI Verification + Dynamic Knowledge Adjustment Audit Log */}
        <div className="lg:col-span-5 space-y-6">
          {/* Literature & DOI Verification */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">
                第七阶段 · 权威文献、DOI 与公式真实性核验
              </h2>
              <p className="text-xs text-slate-500">
                所有补充知识均依据经典文献与正式发表论文，支持输入任意 DOI / 标题实时联网查验。
              </p>
            </div>

            <form onSubmit={handleVerifyDoi} className="flex gap-2">
              <label htmlFor="verify-doi-input" className="sr-only">
                输入文献标题、作者或 DOI 核验
              </label>
              <input
                id="verify-doi-input"
                type="text"
                value={doiQuery}
                onChange={(e) => setDoiQuery(e.target.value)}
                placeholder="输入 DOI（如 10.1103/PhysRevLett.42.1195）或作者名核验"
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={isVerifyingDoi}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isVerifyingDoi ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>核验文献</span>
              </button>
            </form>

            {doiError && (
              <DiagnosticAlert
                variant="error"
                title="文献 / DOI 联网核验失败"
                message={doiError}
                retryLabel="重试核验"
                isRetrying={isVerifyingDoi}
                onRetry={() => runDoiVerification(doiQuery)}
              />
            )}

            {doiResult && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-2.5">
                {doiResult.generationMeta?.degraded && (
                  <DiagnosticAlert
                    variant="degraded"
                    title="Gemini 综述生成降级（已保留数据库原始检索条目）"
                    message={doiResult.generationMeta.reason || 'Gemini 响应异常'}
                    meta={doiResult.generationMeta}
                    retryLabel="重新生成核验综述"
                    isRetrying={isVerifyingDoi}
                    onRetry={() => runDoiVerification(doiResult.query)}
                  />
                )}
                <div className="font-semibold text-slate-900">实时核验报告：</div>
                <div className="text-slate-700 whitespace-pre-line leading-relaxed">
                  <MixedAcademicText text={doiResult.synthesis} />
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
              {document.citations.map((cit, idx) => (
                <div key={idx} className="p-3.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {cit.citeKey} · {cit.authorsAndYear}
                    </span>
                    <span className="font-mono-tabular text-emerald-700 font-medium whitespace-nowrap shrink-0">
                      ● {cit.status}
                    </span>
                  </div>
                  <div className="font-medium text-slate-800">{cit.title}</div>
                  <div className="text-slate-600">
                    <MixedAcademicText text={cit.verificationNote} />
                  </div>
                  <div className="flex items-center justify-between pt-1 text-slate-500 font-mono-tabular">
                    <span>ID: {cit.doiOrArxiv}</span>
                    {cit.url && (
                      <a
                        href={cit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <span>DOI / arXiv 源</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Dynamic Knowledge Adjustment Log (Stage 5) */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">
                第五阶段 · 动态知识水平调整审计日志
              </h2>
              <p className="text-xs text-slate-500">
                记录您在阅读过程中确认掌握或追问推导的反馈历史（仅针对具体概念节点精细更新，绝不盲目外推至整章）。
              </p>
            </div>

            {feedbackHistory.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                暂无动态变更记录。您可以在《深度翻译与精准批注》视图中点击任意批注右上角的「已掌握 (升为 K1 折叠)」或「追问推导细节」，系统将在此实时记录知识模型演进。
              </div>
            ) : (
              <div className="space-y-3">
                {feedbackHistory.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono-tabular text-slate-500">
                      <span className="font-semibold text-slate-900">
                        {ev.conceptZh} ({ev.conceptEn})
                      </span>
                      <span>
                        {ev.previousLevel} → <strong className="text-blue-700">{ev.newLevel}</strong> ·{' '}
                        {ev.timestamp}
                      </span>
                    </div>
                    <div className="text-slate-700">{ev.reason}</div>
                    <div className="text-emerald-800 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{ev.effectOnDocument}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

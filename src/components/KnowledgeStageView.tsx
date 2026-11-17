import React, { useState, useMemo } from 'react';
import {
  ReadingMaterial,
  KnowledgeNode,
  KnowledgeAnalysisReport,
  KnowledgeLevel,
  EpistemicStatus,
  WebGroundingSource,
  ChapterScopeItem,
} from '../types/physics';
import { computeKnowledgeMetrics } from '../utils/knowledgeEngine';
import {
  analyzeMaterialScopeDeterministically,
  matchTextbookCatalog,
  TextbookCatalogChapter,
} from '../utils/scopeParser';
import { MixedAcademicText, LatexBlock } from './LatexRenderer';
import {
  Search,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  BookOpen,
  FileText,
  Sparkles,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DiagnosticAlert } from './DiagnosticAlert';
import { apiFetch } from '../utils/quotaTracker';

interface KnowledgeStageViewProps {
  materials: ReadingMaterial[];
  knowledgeNodes: KnowledgeNode[];
  report: KnowledgeAnalysisReport | null;
  isGeneratingReport: boolean;
  reportError?: string | null;
  onAddMaterial: (mat: ReadingMaterial, newNodes: KnowledgeNode[]) => void;
  onUpdateMaterialBreakdown: (materialId: string, newBreakdown: ChapterScopeItem[]) => void;
  onRemoveMaterial: (id: string) => void;
  onAddCustomNode: (node: KnowledgeNode) => void;
  onRemoveNode: (nodeId: string) => void;
  onUpdateNodeLevel: (nodeId: string, newLevel: KnowledgeLevel, reason: string) => void;
  onGenerateReport: () => Promise<void>;
  onProceedToPreAnalysis: () => void;
  onClearAllWorkspace: () => void;
}

export const KnowledgeStageView: React.FC<KnowledgeStageViewProps> = ({
  materials,
  knowledgeNodes,
  report,
  isGeneratingReport,
  reportError,
  onAddMaterial,
  onUpdateMaterialBreakdown,
  onRemoveMaterial,
  onAddCustomNode,
  onRemoveNode,
  onUpdateNodeLevel,
  onGenerateReport,
  onProceedToPreAnalysis,
  onClearAllWorkspace,
}) => {
  const [activeLevelFilter, setActiveLevelFilter] = useState<'ALL' | KnowledgeLevel>('ALL');

  // Form states for adding a reading material
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [editionOrYear, setEditionOrYear] = useState('');
  const [readScope, setReadScope] = useState('');
  const [selfReportedMastered, setSelfReportedMastered] = useState('');
  const [selfReportedUnfamiliar, setSelfReportedUnfamiliar] = useState('');
  const [isAnalyzingMaterial, setIsAnalyzingMaterial] = useState(false);
  const [materialError, setMaterialError] = useState('');

  // Authentic book TOC states (fetched from internet or pasted by user for unlisted books)
  const [fetchedBookChapters, setFetchedBookChapters] = useState<TextbookCatalogChapter[]>([]);
  const [fetchedTocSourceLabel, setFetchedTocSourceLabel] = useState('');
  const [isFetchingToc, setIsFetchingToc] = useState(false);
  const [showCustomTocEditor, setShowCustomTocEditor] = useState(false);
  const [customTocText, setCustomTocText] = useState('');

  // Optional per-chapter manual overrides in the form preview before submission
  const [previewChapterOverrides, setPreviewChapterOverrides] = useState<
    Record<number, ChapterScopeItem['status']>
  >({});

  // Track which added material cards have their full chapter table expanded
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Record<string, boolean>>({});

  // Manual custom knowledge node form
  const [showCustomNodeForm, setShowCustomNodeForm] = useState(false);
  const [customConceptZh, setCustomConceptZh] = useState('');
  const [customConceptEn, setCustomConceptEn] = useState('');
  const [customLevel, setCustomLevel] = useState<KnowledgeLevel>('K1');
  const [customFormula, setCustomFormula] = useState('');
  const [customRationale, setCustomRationale] = useState('');

  // Live internet search & verification state
  const [webQuery, setWebQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'textbook' | 'paper' | 'concept'>('textbook');
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [webSearchResult, setWebSearchResult] = useState<{
    query: string;
    synthesis: string;
    sources: WebGroundingSource[];
  } | null>(null);
  const [webSearchError, setWebSearchError] = useState('');

  const metrics = computeKnowledgeMetrics(materials, knowledgeNodes);

  // Real-time preview of chapter-by-chapter scope recognition as user types in the form!
  // Strictly uses real chapters (from customTocText, fetchedBookChapters, or matchedCatalog).
  // Never invents fake 12-chapter placeholders!
  const liveScopePreview = useMemo(() => {
    if (!title.trim() && !readScope.trim()) return null;
    const matchedCatalog = matchTextbookCatalog(title.trim(), authors.trim());
    const base = analyzeMaterialScopeDeterministically({
      title: title.trim() || '当前录入教材',
      authors: authors.trim(),
      editionOrYear: editionOrYear.trim(),
      readScope: readScope.trim() || '尚未填写具体章节',
      selfReportedMastered: selfReportedMastered.trim(),
      selfReportedUnfamiliar: selfReportedUnfamiliar.trim(),
      externalChapters: fetchedBookChapters.length > 0 ? fetchedBookChapters : undefined,
      customTocText: customTocText.trim() || undefined,
    });

    const mergedBreakdown = base.chapterBreakdown.map((ch) => {
      const override = previewChapterOverrides[ch.chapterNumber];
      if (!override) return ch;
      return {
        ...ch,
        status: override,
        statusReason:
          override === 'mastered_k1'
            ? `您手动点选确认第 ${ch.chapterNumber} 章为「已读掌握 (K1)」`
            : override === 'partial_k2'
            ? `您手动点选确认第 ${ch.chapterNumber} 章为「接触过/半熟 (K2)」`
            : `您手动点选确认第 ${ch.chapterNumber} 章为「未读/陌生 (K3)」`,
      };
    });

    const tocSourceDescription = customTocText.trim()
      ? `您自定义的章节目录（共 ${mergedBreakdown.length} 章）`
      : fetchedBookChapters.length > 0
      ? fetchedTocSourceLabel || `互联网实时获取的《${title.trim()}》章节目录（共 ${mergedBreakdown.length} 章）`
      : matchedCatalog
      ? `已匹配《${matchedCatalog.canonicalTitle}》真实目录（共 ${matchedCatalog.chapters.length} 章）`
      : '';

    return {
      ...base,
      matchedCatalog,
      tocSourceDescription,
      chapterBreakdown: mergedBreakdown,
    };
  }, [
    title,
    authors,
    editionOrYear,
    readScope,
    selfReportedMastered,
    selfReportedUnfamiliar,
    fetchedBookChapters,
    fetchedTocSourceLabel,
    customTocText,
    previewChapterOverrides,
  ]);

  const handleFetchBookToc = async () => {
    if (!title.trim()) {
      setMaterialError('请先填写「书籍、教材或论文名称」，再点击获取该书的真实章节目录。');
      return;
    }
    setMaterialError('');
    setIsFetchingToc(true);
    try {
      const resp = await apiFetch('/api/fetch-book-toc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          authors: authors.trim(),
          editionOrYear: editionOrYear.trim(),
          customTocText: customTocText.trim() || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '获取书籍真实章节目录失败');
      }
      if (Array.isArray(data.chapters) && data.chapters.length > 0) {
        setFetchedBookChapters(data.chapters);
        setFetchedTocSourceLabel(
          data.tocSource === 'builtin_catalog'
            ? `已匹配《${data.canonicalTitle}》标准目录（共 ${data.chapters.length} 章）`
            : data.tocSource === 'openlibrary_toc'
            ? `已从 OpenLibrary 获取《${data.canonicalTitle}》真实目录（共 ${data.chapters.length} 章）`
            : data.tocSource === 'web_gemini_toc'
            ? `已通过互联网检索提取《${data.canonicalTitle}》真实目录（共 ${data.chapters.length} 章）`
            : `已加载《${data.canonicalTitle}》章节目录（共 ${data.chapters.length} 章）`
        );
        if (data.authors && !authors.trim()) setAuthors(data.authors);
        if (data.editionOrYear && !editionOrYear.trim()) setEditionOrYear(data.editionOrYear);
      } else {
        setShowCustomTocEditor(true);
        setMaterialError(
          '公开数据库中暂未收录该书的完整章节列表。您可直接在下方「手动粘贴/自定义本书章节目录」框中粘贴目录（每行一章），或直接点击底部按钮由系统在提交时自动深度检索。'
        );
      }
    } catch (err) {
      setMaterialError(err instanceof Error ? err.message : '获取真实目录异常');
    } finally {
      setIsFetchingToc(false);
    }
  };

  const handleTogglePreviewChapter = (chNum: number, currentStatus: ChapterScopeItem['status']) => {
    const nextStatus: ChapterScopeItem['status'] =
      currentStatus === 'mastered_k1'
        ? 'partial_k2'
        : currentStatus === 'partial_k2'
        ? 'unread_k3'
        : 'mastered_k1';
    setPreviewChapterOverrides((prev) => ({
      ...prev,
      [chNum]: nextStatus,
    }));
  };

  const filteredNodes =
    activeLevelFilter === 'ALL'
      ? knowledgeNodes
      : knowledgeNodes.filter((n) => n.level === activeLevelFilter);

  const handleWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webQuery.trim()) {
      setWebSearchError('请输入您需要检索的教材名称、作者、arXiv 编号、DOI 或理论物理概念。');
      return;
    }
    setWebSearchError('');
    setIsSearchingWeb(true);
    try {
      const resp = await apiFetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: webQuery.trim(), searchMode }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '联网检索请求失败');
      }
      setWebSearchResult(data);
    } catch (err) {
      setWebSearchError(err instanceof Error ? err.message : '联网检索核验异常');
    } finally {
      setIsSearchingWeb(false);
    }
  };

  const handleUseSourceInForm = (src: WebGroundingSource) => {
    const parts = src.title.split('—');
    const cleanTitle = parts[0]?.trim() || src.title;
    const cleanAuthor = parts[1]?.replace(/\(\d{4}\)/, '').trim() || '';
    const yearMatch = src.title.match(/\((\d{4})\)/);
    setTitle(cleanTitle);
    if (cleanAuthor) setAuthors(cleanAuthor);
    if (yearMatch) setEditionOrYear(yearMatch[1]);
    setFetchedBookChapters([]);
    setFetchedTocSourceLabel('');
    setPreviewChapterOverrides({});
  };

  const handleAddMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !readScope.trim()) {
      setMaterialError('请填写「书籍/论文名称」以及「实际阅读章节或范围」（系统严禁仅凭书名默认您掌握全书内容）。');
      return;
    }
    setMaterialError('');
    setIsAnalyzingMaterial(true);

    try {
      const resp = await apiFetch('/api/analyze-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          authors: authors.trim(),
          editionOrYear: editionOrYear.trim(),
          readScope: readScope.trim(),
          selfReportedMastered: selfReportedMastered.trim(),
          selfReportedUnfamiliar: selfReportedUnfamiliar.trim(),
          customTocText: customTocText.trim() || undefined,
          prefetchedChapters: fetchedBookChapters.length > 0 ? fetchedBookChapters : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '分析阅读材料失败');
      }

      const newMatId = `mat-${Date.now()}`;
      const rawBreakdown: ChapterScopeItem[] = Array.isArray(data.chapterBreakdown)
        ? data.chapterBreakdown
        : liveScopePreview?.chapterBreakdown || [];

      // Apply any manual chapter clicks the user made in the live preview
      const finalBreakdown = rawBreakdown.map((ch) => {
        const override = previewChapterOverrides[ch.chapterNumber];
        return override ? { ...ch, status: override } : ch;
      });

      const masteredChs = finalBreakdown.filter((c) => c.status === 'mastered_k1');
      const partialChs = finalBreakdown.filter((c) => c.status === 'partial_k2');
      const unreadChs = finalBreakdown.filter((c) => c.status === 'unread_k3');

      const hasManualOverrides = Object.keys(previewChapterOverrides).length > 0;

      const explicitMastered = hasManualOverrides
        ? masteredChs.flatMap((ch) =>
            ch.coreConcepts
              .slice(0, 2)
              .map((c) => `第 ${ch.chapterNumber} 章（${ch.chapterTitleZh}）：${c}`)
          )
        : Array.isArray(data.explicitMastered)
        ? data.explicitMastered
        : [];

      const inferredMastered = hasManualOverrides
        ? partialChs.map(
            (ch) => `第 ${ch.chapterNumber} 章（${ch.chapterTitleZh}）：${ch.coreConcepts.join('、')}`
          )
        : Array.isArray(data.inferredMastered)
        ? data.inferredMastered
        : [];

      const unlearnedOrSkipped = hasManualOverrides
        ? unreadChs.map(
            (ch) =>
              `未读第 ${ch.chapterNumber} 章《${ch.chapterTitleZh}》：${ch.coreConcepts
                .slice(0, 2)
                .join('、')}`
          )
        : Array.isArray(data.unlearnedOrSkipped)
        ? data.unlearnedOrSkipped
        : [];

      const newMat: ReadingMaterial = {
        id: newMatId,
        title: title.trim(),
        authors: data.authors || authors.trim() || '学术作者',
        editionOrYear: data.editionOrYear || editionOrYear.trim() || '标准版本',
        domain: data.domain || '理论物理',
        readScope: readScope.trim(),
        parsedScopeSummary:
          data.parsedScopeSummary ||
          `已精确识别：已读掌握 ${masteredChs.length} 章 (K1)，接触过 ${partialChs.length} 章 (K2)，未读 ${unreadChs.length} 章 (K3)`,
        chapterBreakdown: finalBreakdown,
        explicitMastered,
        inferredMastered,
        unlearnedOrSkipped,
        mathTools: Array.isArray(data.mathTools) ? data.mathTools : [],
        keyTheoremsAndFormulas: Array.isArray(data.keyTheoremsAndFormulas)
          ? data.keyTheoremsAndFormulas
          : [],
        depthRating:
          data.depthRating ||
          (finalBreakdown.length > 0
            ? `本书共 ${finalBreakdown.length} 章：已读掌握 ${masteredChs.length} 章 (K1)、半熟 ${partialChs.length} 章 (K2)、未读 ${unreadChs.length} 章 (K3)`
            : `已按阅读范围 (${readScope.trim()}) 精确建模`),
        supportedPhysicsProblems: Array.isArray(data.supportedPhysicsProblems)
          ? data.supportedPhysicsProblems
          : [],
        verifiedSources: Array.isArray(data.verifiedSources) ? data.verifiedSources : [],
      };

      const extractedNodes: KnowledgeNode[] = Array.isArray(data.extractedNodes)
        ? data.extractedNodes.map((n: Record<string, string>, idx: number) => ({
            id: `kn-${newMatId}-${idx}`,
            conceptNameZh: n.conceptNameZh || `${title.trim()} 知识点`,
            conceptNameEn: n.conceptNameEn || title.trim(),
            level: (['K1', 'K2', 'K3', 'K4'].includes(n.level) ? n.level : 'K2') as KnowledgeLevel,
            epistemicStatus: (['已有材料', '已学习知识', '推测掌握知识', '未知知识'].includes(
              n.epistemicStatus
            )
              ? n.epistemicStatus
              : '已学习知识') as EpistemicStatus,
            domain: newMat.domain,
            sourceMaterialIds: [newMatId],
            rationale: n.rationale || `基于《${newMat.title}》(${newMat.readScope}) 拆解生成。`,
            formulaLatex: n.formulaLatex,
          }))
        : [];

      onAddMaterial(newMat, extractedNodes);
      setExpandedMaterialIds((prev) => ({ ...prev, [newMatId]: true }));

      setTitle('');
      setAuthors('');
      setEditionOrYear('');
      setReadScope('');
      setSelfReportedMastered('');
      setSelfReportedUnfamiliar('');
      setFetchedBookChapters([]);
      setFetchedTocSourceLabel('');
      setCustomTocText('');
      setShowCustomTocEditor(false);
      setPreviewChapterOverrides({});
    } catch (err) {
      setMaterialError(err instanceof Error ? err.message : '分析材料时出现错误');
    } finally {
      setIsAnalyzingMaterial(false);
    }
  };

  const handleAddCustomNodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customConceptZh.trim()) return;
    const epistemicMap: Record<KnowledgeLevel, EpistemicStatus> = {
      K1: '已学习知识',
      K2: '推测掌握知识',
      K3: '未知知识',
      K4: '未知知识',
    };
    const newNode: KnowledgeNode = {
      id: `kn-manual-${Date.now()}`,
      conceptNameZh: customConceptZh.trim(),
      conceptNameEn: customConceptEn.trim() || customConceptZh.trim(),
      level: customLevel,
      epistemicStatus: epistemicMap[customLevel],
      domain: '手动定义节点',
      sourceMaterialIds: [],
      rationale: customRationale.trim() || `用户手动将该概念指定为 ${customLevel}`,
      formulaLatex: customFormula.trim() || undefined,
    };
    onAddCustomNode(newNode);
    setCustomConceptZh('');
    setCustomConceptEn('');
    setCustomFormula('');
    setCustomRationale('');
    setShowCustomNodeForm(false);
  };

  return (
    <div className="space-y-8">
      {/* Stage 1 Header & Progress Status */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs font-mono-tabular text-slate-500">
              第一阶段（工作流第 1–2 步）· 接收您的阅读书目与论文材料并建立个人知识模型
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              个人知识背景建模工作台
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              请在下方录入您<strong className="font-semibold text-slate-900">已经阅读过的教材、专著或前置论文及其具体版本、章节范围</strong>。系统内置章节级范围解析器与互联网学术目录检索，能够精确识别「第1–7章」「前四章」「跳过第5章」「第6章略读」等任意表达，并提供逐章可视化校准。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {(materials.length > 0 || knowledgeNodes.length > 0) && (
              <button
                type="button"
                onClick={onClearAllWorkspace}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>清空重置</span>
              </button>
            )}

            <button
              type="button"
              onClick={onGenerateReport}
              disabled={materials.length === 0 || isGeneratingReport}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGeneratingReport ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>正在生成《个人知识背景分析报告》...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {report
                      ? '重新生成《个人知识背景分析报告》'
                      : '生成《个人知识背景分析报告》'}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onProceedToPreAnalysis}
              disabled={materials.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>下一步：导入待译英文论文</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Column Quantitative Epistemic Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
          <div>
            <div className="text-xs font-mono-tabular text-slate-500">
              K1 基础知识 · 免除冗余批注
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-bold font-mono-tabular text-slate-900">
                {metrics.levelCounts.K1}
              </span>
              <span className="text-xs font-mono-tabular text-slate-500 ml-1.5">
                项已掌握概念
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              已学习知识：{metrics.epistemicBreakdown.explicitMasteredCount} 项
            </div>
          </div>

          <div>
            <div className="text-xs font-mono-tabular text-slate-500">
              K2 相关知识 · 仅在障碍处点拨
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-bold font-mono-tabular text-slate-900">
                {metrics.levelCounts.K2}
              </span>
              <span className="text-xs font-mono-tabular text-slate-500 ml-1.5">
                项接触过概念
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              推测掌握知识：{metrics.epistemicBreakdown.inferredCount} 项
            </div>
          </div>

          <div>
            <div className="text-xs font-mono-tabular text-slate-500">
              K3 陌生知识 · 必须补充前置与机制
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-bold font-mono-tabular text-amber-700">
                {metrics.levelCounts.K3}
              </span>
              <span className="text-xs font-mono-tabular text-slate-500 ml-1.5">
                项未读/陌生缺口
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              未知知识：{metrics.epistemicBreakdown.unknownCount} 项
            </div>
          </div>

          <div>
            <div className="text-xs font-mono-tabular text-slate-500">
              已有材料 · 您已录入的书籍/论文
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-bold font-mono-tabular text-blue-700">
                {metrics.epistemicBreakdown.providedMaterialsCount}
              </span>
              <span className="text-xs font-mono-tabular text-slate-500 ml-1.5">
                部学习材料
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              分析报告状态：{report ? '● 已生成' : '○ 待生成'}
            </div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols): Live Web Search + Material Input Form with Real-Time Scope Preview */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Live Internet Search & Academic Verification Card */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">
                互联网实时检索教材、版本目录与 arXiv 文献
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                输入任意理论物理教材名、作者、DOI 或 arXiv 编号，系统将实时检索 OpenLibrary、CrossRef 与 arXiv，并支持一键填入下方录入表单。
              </p>
            </div>

            <form onSubmit={handleWebSearch} className="space-y-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                {(
                  [
                    { id: 'textbook', label: '检索教材版本与目录' },
                    { id: 'paper', label: '检索 arXiv / DOI 论文' },
                    { id: 'concept', label: '检索理论物理概念' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSearchMode(tab.id)}
                    className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      searchMode === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <label htmlFor="live-web-search-input" className="sr-only">
                  输入检索关键词
                </label>
                <input
                  id="live-web-search-input"
                  type="text"
                  value={webQuery}
                  onChange={(e) => setWebQuery(e.target.value)}
                  placeholder="输入书名/作者/arXiv号，如：Peskin Quantum Field Theory 或 Sakurai"
                  className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={isSearchingWeb}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isSearchingWeb ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>{isSearchingWeb ? '检索中...' : '联网检索'}</span>
                </button>
              </div>
            </form>

            {webSearchError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700">
                {webSearchError}
              </div>
            )}

            {webSearchResult && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
                <div className="text-xs font-semibold text-slate-900">
                  「{webSearchResult.query}」互联网实时检索结果：
                </div>
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                  <MixedAcademicText text={webSearchResult.synthesis} />
                </div>
                {webSearchResult.sources.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-mono-tabular text-slate-500">
                      检索到的文献源（点击「填入表单」可直接导入下方）：
                    </div>
                    {webSearchResult.sources.slice(0, 5).map((src, i) => (
                      <div
                        key={i}
                        className="p-2.5 bg-white border border-slate-200 rounded text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 truncate">{src.title}</div>
                          <div className="text-slate-500 font-mono-tabular truncate">
                            [{src.sourceType}] {src.snippet || src.uri}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUseSourceInForm(src)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
                          >
                            填入表单
                          </button>
                          <a
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`打开外部链接 ${src.title}`}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2. Input Form for User's Read Books / Textbooks / Papers */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">
                录入您已阅读过的书籍、教材或论文
              </h2>
              <p className="text-xs text-slate-500">
                支持识别任意章节与主题表达（如「第1-7章和第9章」「前四章」「跳过第3章，第6章略读」），并在下方实时预览章节识别结果。
              </p>
            </div>

            <form onSubmit={handleAddMaterialSubmit} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="mat-title" className="block text-xs font-medium text-slate-700">
                    书籍、教材或论文名称 *
                  </label>
                  {title.trim() && (
                    <button
                      type="button"
                      onClick={handleFetchBookToc}
                      disabled={isFetchingToc}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                    >
                      {isFetchingToc ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Search className="w-3 h-3" />
                      )}
                      <span>{isFetchingToc ? '正在检索真实目录...' : '联网获取本书真实章节目录'}</span>
                    </button>
                  )}
                </div>
                <input
                  id="mat-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFetchedBookChapters([]);
                    setFetchedTocSourceLabel('');
                    setPreviewChapterOverrides({});
                  }}
                  placeholder="例如：喀兴林《高等量子力学》、朗道《力学》、Peskin QFT、Sakurai 或任意专著"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mat-authors" className="block text-xs font-medium text-slate-700 mb-1">
                    作者（可选，自动补全）
                  </label>
                  <input
                    id="mat-authors"
                    type="text"
                    value={authors}
                    onChange={(e) => setAuthors(e.target.value)}
                    placeholder="例如：喀兴林 / 朗道 / Peskin"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="mat-edition" className="block text-xs font-medium text-slate-700 mb-1">
                    具体版本或年份（可选）
                  </label>
                  <input
                    id="mat-edition"
                    type="text"
                    value={editionOrYear}
                    onChange={(e) => setEditionOrYear(e.target.value)}
                    placeholder="例如：第二版 / 1995 First Edition"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="mat-scope" className="block text-xs font-medium text-slate-700 mb-1">
                  实际阅读章节或范围 *（支持中文/英文数字、排除章、略读章与主题词）
                </label>
                <input
                  id="mat-scope"
                  type="text"
                  value={readScope}
                  onChange={(e) => {
                    setReadScope(e.target.value);
                    setPreviewChapterOverrides({});
                  }}
                  placeholder="例如：第 1–5 章，第 4 章不太熟，跳过第 3 章"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* REAL-TIME SCOPE RECOGNITION PREVIEW & INTERACTIVE CHAPTER SELECTOR */}
              {liveScopePreview && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      实时学习范围识别预览
                      {liveScopePreview.tocSourceDescription
                        ? ` · ${liveScopePreview.tocSourceDescription}`
                        : ' · 已解析阅读章节号'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCustomTocEditor((prev) => !prev)}
                        className="text-[11px] font-medium text-slate-600 hover:text-blue-700 underline cursor-pointer"
                      >
                        {showCustomTocEditor ? '收起自定义目录' : '手动粘贴/修改本书目录'}
                      </button>
                    </div>
                  </div>

                  <div className="text-slate-700 leading-relaxed bg-white p-2.5 border border-slate-200/80 rounded">
                    {liveScopePreview.parsedScopeSummary}
                  </div>

                  {showCustomTocEditor && (
                    <div className="p-2.5 bg-white border border-blue-200 rounded space-y-1.5">
                      <label htmlFor="custom-toc-textarea" className="block text-[11px] font-semibold text-slate-800">
                        粘贴或编辑《{title.trim() || '当前书籍'}》真实章节目录（每行一章，系统将立即按此目录生成逐章 K1–K3 校准列表）：
                      </label>
                      <textarea
                        id="custom-toc-textarea"
                        rows={5}
                        value={customTocText}
                        onChange={(e) => {
                          setCustomTocText(e.target.value);
                          setPreviewChapterOverrides({});
                        }}
                        placeholder={`例如（每行一章）：\n第1章 希尔伯特空间与态矢\n第2章 量子力学基本公设与绘景\n第3章 对称性与守恒律（可用冒号附上核心概念，如：第3章 对称性：空间平移、宇称、时间反演）`}
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {liveScopePreview.chapterBreakdown.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-slate-500">
                        《{title.trim() || liveScopePreview.matchedCatalog?.canonicalTitle}》真实章节逐章映射（共{' '}
                        <strong className="font-mono-tabular text-slate-800">
                          {liveScopePreview.chapterBreakdown.length}
                        </strong>{' '}
                        章，点击任意章节可切换：
                        <span className="text-emerald-700 font-semibold"> ● 已读掌握 K1</span> /
                        <span className="text-blue-700 font-semibold"> ▲ 接触半熟 K2</span> /
                        <span className="text-amber-700 font-semibold"> ◆ 未读陌生 K3</span>）：
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-1">
                        {liveScopePreview.chapterBreakdown.map((ch) => (
                          <button
                            key={ch.chapterNumber}
                            type="button"
                            onClick={() => handleTogglePreviewChapter(ch.chapterNumber, ch.status)}
                            className={`text-left px-2.5 py-1.5 rounded border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                              ch.status === 'mastered_k1'
                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                : ch.status === 'partial_k2'
                                ? 'bg-blue-50/70 border-blue-300 text-blue-950'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate">
                                <span className="font-mono-tabular font-semibold mr-1.5">
                                  第 {ch.chapterNumber} 章
                                </span>
                                <span className="font-medium">{ch.chapterTitleZh}</span>
                              </div>
                              {ch.coreConcepts.length > 0 && (
                                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                  包含：{ch.coreConcepts.join(' · ')}
                                </div>
                              )}
                            </div>
                            <span
                              className={`text-[11px] font-mono-tabular font-semibold shrink-0 whitespace-nowrap ${
                                ch.status === 'mastered_k1'
                                  ? 'text-emerald-700'
                                  : ch.status === 'partial_k2'
                                  ? 'text-blue-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {ch.status === 'mastered_k1'
                                ? '● 已读 K1'
                                : ch.status === 'partial_k2'
                                ? '▲ 半熟 K2'
                                : '◆ 未读 K3'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-white border border-slate-200 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="text-[11px] text-slate-600 leading-relaxed">
                        《{title.trim() || '当前录入书目'}》不在本地预置目录中（系统绝不套用虚假的通用章节模板）。您可点击右侧按钮实时从互联网获取该书的真实章节目录，或手动粘贴本书目录。
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleFetchBookToc}
                          disabled={isFetchingToc || !title.trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {isFetchingToc ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Search className="w-3 h-3" />
                          )}
                          <span>{isFetchingToc ? '正在获取目录...' : '联网获取本书真实目录'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="mat-mastered" className="block text-xs font-medium text-slate-700 mb-1">
                  额外补充：您明确表示已掌握的特定理论/公式（将直接归入 K1，可选）
                </label>
                <textarea
                  id="mat-mastered"
                  rows={2}
                  value={selfReportedMastered}
                  onChange={(e) => setSelfReportedMastered(e.target.value)}
                  placeholder="例如：Wick 定理、Dirac 方程旋量解、高斯路径积分（可留空，系统已按上方已读章节自动提取核心概念与公式）"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="mat-unfamiliar" className="block text-xs font-medium text-slate-700 mb-1">
                  额外补充：书中仍感生疏或跳过的特定内容（将直接归入 K3，可选）
                </label>
                <textarea
                  id="mat-unfamiliar"
                  rows={2}
                  value={selfReportedUnfamiliar}
                  onChange={(e) => setSelfReportedUnfamiliar(e.target.value)}
                  placeholder="例如：非阿贝尔规范场 Faddeev-Popov 鬼场与 BRST、手征反常（可留空，系统已将未读章节自动归入 K3）"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {materialError && (
                <DiagnosticAlert
                  variant="error"
                  title="阅读范围解析提示"
                  message={materialError}
                />
              )}

              <button
                type="submit"
                disabled={isAnalyzingMaterial}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors cursor-pointer"
              >
                {isAnalyzingMaterial ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在精确解析阅读范围并生成 K1–K3 章节知识节点...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>确认学习范围并添加此材料</span>
                  </>
                )}
              </button>
            </form>
          </section>
        </div>

        {/* Right Column (7 cols): User's Added Materials, Knowledge Report & K1-K4 Matrix */}
        <div className="lg:col-span-7 space-y-6">
          {materials.length === 0 && knowledgeNodes.length === 0 ? (
            /* Blank Slate Guidance when user first opens the app */
            <section className="bg-white border border-slate-200 rounded-lg p-8 sm:p-10 space-y-6">
              <div className="space-y-2">
                <div className="text-xs font-mono-tabular text-blue-600 font-semibold">
                  当前状态：空白工作台 · 等待您提供个人阅读材料
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  欢迎使用理论物理论文深度翻译与精准批注系统
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  本工作台不包含任何预设的静态演示数据。请按照以下标准科研流程开始您的论文精读任务：
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>第一步：在左侧录入您读过的教材/论文与章节范围</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    提供您读过的书籍名称及具体章节范围（例如 <em>Peskin QFT 第1–7章与第9章</em> 或 <em>Sakurai 前四章</em>）。系统会实时显示逐章范围识别预览，区分「已学习知识 (K1)」「接触半熟知识 (K2)」与「未读陌生知识 (K3)」。
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>第二步：生成《个人知识背景分析报告》</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    录入完成后，点击右上角「生成《个人知识背景分析报告》」。您可以在右侧逐章列表中点击任意章节或概念微调 K1–K4 分级。
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-blue-600" />
                    <span>第三步：导入待译英文论文并执行预分析</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    支持输入任意 <strong className="font-semibold text-slate-900">arXiv 编号 / URL</strong> 实时从互联网拉取论文全文与 LaTeX 公式，或上传 .tex / .txt 文件、粘贴英文段落。系统将先输出逐章知识缺口预分析报告。
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>第四步：确认预分析后生成纯中文精准批注文稿</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    经您确认后，系统执行全文中文学术翻译，自动省去 K1 已知基础解释，对 K3/K4 核心障碍提供五类深度批注与【原文推导】【补充推导】【独立核验】三级公式拆解。
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              {/* Formal《个人知识背景分析报告》Section */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-mono-tabular text-slate-500">
                      阶段一核心产出 · 供后续论文预分析与精准批注调用
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                      《个人知识背景分析报告》
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={onGenerateReport}
                    disabled={isGeneratingReport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isGeneratingReport ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>正在综合分析...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{report ? '更新分析报告' : '立即生成分析报告'}</span>
                      </>
                    )}
                  </button>
                </div>

                {reportError && (
                  <DiagnosticAlert
                    variant="error"
                    title="生成《个人知识背景分析报告》失败"
                    message={reportError}
                    retryLabel="重试生成报告"
                    isRetrying={isGeneratingReport}
                    onRetry={onGenerateReport}
                  />
                )}

                {!report ? (
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      您已录入 <strong>{materials.length}</strong> 部学习材料并精确识别了{' '}
                      <strong>{knowledgeNodes.length}</strong> 个章节与概念节点。如果已核对完毕，请点击右侧按钮生成完整的《个人知识背景分析报告》。
                    </div>
                    <button
                      type="button"
                      onClick={onGenerateReport}
                      disabled={isGeneratingReport}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      生成《个人知识背景分析报告》
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                    {report.generationMeta?.degraded && (
                      <DiagnosticAlert
                        variant="degraded"
                        title="分析报告已降级为本地结构化汇总"
                        message={
                          report.generationMeta.reason ||
                          'Gemini 综合分析暂不可用，当前基于您录入的章节节点生成结构化摘要。'
                        }
                        meta={report.generationMeta}
                        retryLabel="重新调用 Gemini 综合分析"
                        isRetrying={isGeneratingReport}
                        onRetry={onGenerateReport}
                      />
                    )}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                        一、综合知识储备与学术定位
                      </h3>
                      <p className="text-slate-800 leading-relaxed">
                        <MixedAcademicText text={report.overallSummary} />
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                        <div className="text-xs font-semibold text-slate-900">
                          二、已确立的基础理论优势（K1 直接免批注）
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                          {report.strengths.map((s, idx) => (
                            <li key={idx}>
                              <MixedAcademicText text={s} />
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                        <div className="text-xs font-semibold text-slate-900">
                          三、知识判断边界防线（严禁默认全书已掌握）
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                          {report.criticalBoundaries.map((b, idx) => (
                            <li key={idx}>
                              <MixedAcademicText text={b} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-2 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        四、面向后续翻译的精准批注执行准则
                      </h3>
                      <div className="border border-slate-200 rounded-md divide-y divide-slate-200 text-xs">
                        <div className="p-3.5 flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="sm:w-44 shrink-0 font-semibold text-slate-900">
                            K1 基础知识（不添加批注）
                          </div>
                          <div className="text-slate-700 flex-1">
                            <MixedAcademicText
                              text={report.annotationPolicySummary.skipK1List.join('；')}
                            />
                          </div>
                        </div>
                        <div className="p-3.5 flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="sm:w-44 shrink-0 font-semibold text-blue-800">
                            K2 相关知识（障碍处触发）
                          </div>
                          <div className="text-slate-700 flex-1">
                            <MixedAcademicText
                              text={report.annotationPolicySummary.conditionalK2List.join('；')}
                            />
                          </div>
                        </div>
                        <div className="p-3.5 flex flex-col sm:flex-row sm:items-start gap-3 bg-slate-50/70">
                          <div className="sm:w-44 shrink-0 font-semibold text-amber-900">
                            K3/K4 核心障碍（重点批注）
                          </div>
                          <div className="text-slate-800 flex-1 space-y-1">
                            {report.annotationPolicySummary.mandatoryK3K4Focus.map((item, i) => (
                              <div key={i}>
                                · <MixedAcademicText text={item} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* 2.1 User's Added Reading Materials Breakdown with Interactive Chapter Scope Table */}
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-slate-900">
                  2.1 已录入阅读材料与章节级阅读范围精准映射 ({materials.length} 部)
                </h2>

                {materials.map((mat) => {
                  const isChaptersExpanded = expandedMaterialIds[mat.id] ?? true;

                  return (
                    <article
                      key={mat.id}
                      className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
                        <div className="space-y-1">
                          <div className="text-xs font-mono-tabular text-slate-500">
                            <span>{mat.domain}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{mat.editionOrYear}</span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900">{mat.title}</h3>
                          <div className="text-xs text-slate-600">
                            作者：{mat.authors} · {mat.depthRating}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveMaterial(mat.id)}
                          aria-label={`移除阅读材料 ${mat.title}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3 text-xs">
                        {/* Scope Recognition Banner */}
                        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-md space-y-1">
                          <div>
                            <span className="font-semibold text-slate-900">
                              您录入的原始范围：
                            </span>
                            <span className="text-slate-800 ml-1">{mat.readScope}</span>
                          </div>
                          {mat.parsedScopeSummary && (
                            <div className="text-blue-900 font-medium">
                              系统精确解析结果：{mat.parsedScopeSummary}
                            </div>
                          )}
                        </div>

                        {/* Interactive Chapter-by-Chapter Scope Inspector */}
                        {mat.chapterBreakdown && mat.chapterBreakdown.length > 0 && (
                          <div className="border border-slate-200 rounded-md overflow-hidden">
                            <div className="bg-slate-50 px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-slate-200">
                              <span className="font-semibold text-slate-900">
                                章节级阅读范围映射表（点击右侧状态按钮可逐章切换 K1/K2/K3）
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMaterialIds((prev) => ({
                                    ...prev,
                                    [mat.id]: !isChaptersExpanded,
                                  }))
                                }
                                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                              >
                                <span>{isChaptersExpanded ? '收起章节表' : '展开全部章节'}</span>
                                {isChaptersExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            {isChaptersExpanded && (
                              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                {mat.chapterBreakdown.map((ch) => (
                                  <div
                                    key={ch.chapterNumber}
                                    className={`px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                      ch.status === 'mastered_k1'
                                        ? 'bg-emerald-50/30'
                                        : ch.status === 'partial_k2'
                                        ? 'bg-blue-50/30'
                                        : 'bg-white'
                                    }`}
                                  >
                                    <div className="space-y-0.5 min-w-0 flex-1">
                                      <div className="font-semibold text-slate-900">
                                        <span className="font-mono-tabular mr-1.5">
                                          第 {ch.chapterNumber} 章
                                        </span>
                                        <span>{ch.chapterTitleZh}</span>
                                        <span className="font-normal text-slate-500 ml-1.5">
                                          ({ch.chapterTitleEn})
                                        </span>
                                      </div>
                                      <div className="text-slate-600">
                                        核心内容：<MixedAcademicText text={ch.coreConcepts.join(' · ')} />
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-0.5 rounded">
                                      {(
                                        [
                                          { id: 'mastered_k1', label: '已读 K1' },
                                          { id: 'partial_k2', label: '半熟 K2' },
                                          { id: 'unread_k3', label: '未读 K3' },
                                        ] as const
                                      ).map((opt) => (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          onClick={() => {
                                            const updated = mat.chapterBreakdown!.map((item) =>
                                              item.chapterNumber === ch.chapterNumber
                                                ? { ...item, status: opt.id }
                                                : item
                                            );
                                            onUpdateMaterialBreakdown(mat.id, updated);
                                          }}
                                          className={`px-2 py-1 text-[11px] font-mono-tabular rounded transition-colors whitespace-nowrap cursor-pointer ${
                                            ch.status === opt.id
                                              ? opt.id === 'mastered_k1'
                                                ? 'bg-emerald-700 text-white font-semibold'
                                                : opt.id === 'partial_k2'
                                                ? 'bg-blue-700 text-white font-semibold'
                                                : 'bg-amber-700 text-white font-semibold'
                                              : 'text-slate-600 hover:text-slate-900'
                                          }`}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div>
                          <span className="font-semibold text-emerald-800">
                            ● 已学习知识（已读范围明确掌握 → K1 免批注）：
                          </span>
                          <ul className="mt-1 space-y-1 pl-4 list-disc text-slate-700">
                            {mat.explicitMastered.slice(0, 8).map((item, idx) => (
                              <li key={idx}>
                                <MixedAcademicText text={item} />
                              </li>
                            ))}
                          </ul>
                        </div>

                        {mat.inferredMastered.length > 0 && (
                          <div>
                            <span className="font-semibold text-blue-800">
                              ▲ 推测掌握 / 半熟知识（仅在复杂障碍处点拨 → K2）：
                            </span>
                            <ul className="mt-1 space-y-1 pl-4 list-disc text-slate-700">
                              {mat.inferredMastered.slice(0, 6).map((item, idx) => (
                                <li key={idx}>
                                  <MixedAcademicText text={item} />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {mat.unlearnedOrSkipped.length > 0 && (
                          <div>
                            <span className="font-semibold text-amber-800">
                              ◆ 未知知识 / 未读章节（严禁默认已掌握 → K3 重点批注）：
                            </span>
                            <ul className="mt-1 space-y-1 pl-4 list-disc text-slate-700">
                              {mat.unlearnedOrSkipped.slice(0, 8).map((item, idx) => (
                                <li key={idx}>
                                  <MixedAcademicText text={item} />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 text-slate-600 space-y-1">
                          <div>
                            <span className="font-medium text-slate-800">涉及数学工具：</span>
                            <MixedAcademicText text={mat.mathTools.join('；')} />
                          </div>
                          {mat.keyTheoremsAndFormulas.length > 0 && (
                            <div>
                              <span className="font-medium text-slate-800">核心定义/定理/公式：</span>
                              <MixedAcademicText text={mat.keyTheoremsAndFormulas.join(' ； ')} />
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-slate-800">可支撑理解的物理问题：</span>
                            {mat.supportedPhysicsProblems.join('；')}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>

              {/* 2.2 K1-K4 Knowledge Hierarchy Interactive Matrix */}
              <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      2.2 个人知识四层分级体系 (K1–K4 节点矩阵)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      您可以点击任意节点的 K1–K4 按钮手动校准掌握程度，或补充单独的知识点。
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomNodeForm((prev) => !prev)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>手动添加知识节点</span>
                    </button>
                  </div>
                </div>

                {showCustomNodeForm && (
                  <form
                    onSubmit={handleAddCustomNodeSubmit}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3 text-xs"
                  >
                    <div className="font-semibold text-slate-900">手动新增个人知识节点</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="cn-zh" className="block text-slate-700 mb-1">
                          概念中文名 *
                        </label>
                        <input
                          id="cn-zh"
                          type="text"
                          value={customConceptZh}
                          onChange={(e) => setCustomConceptZh(e.target.value)}
                          placeholder="如：群表示特征标正交定理"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label htmlFor="cn-en" className="block text-slate-700 mb-1">
                          英文术语
                        </label>
                        <input
                          id="cn-en"
                          type="text"
                          value={customConceptEn}
                          onChange={(e) => setCustomConceptEn(e.target.value)}
                          placeholder="如：Character Orthogonality"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label htmlFor="cn-lvl" className="block text-slate-700 mb-1">
                          知识层级
                        </label>
                        <select
                          id="cn-lvl"
                          value={customLevel}
                          onChange={(e) => setCustomLevel(e.target.value as KnowledgeLevel)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                        >
                          <option value="K1">K1 基础知识（已熟练掌握）</option>
                          <option value="K2">K2 相关知识（接触过但不熟）</option>
                          <option value="K3">K3 陌生知识（需重点解释）</option>
                          <option value="K4">K4 论文专属知识</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCustomNodeForm(false)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-600 cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-blue-600 text-white font-medium rounded cursor-pointer"
                      >
                        保存节点
                      </button>
                    </div>
                  </form>
                )}

                {/* Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
                  {(
                    [
                      { id: 'ALL', label: `全部 (${knowledgeNodes.length})` },
                      { id: 'K1', label: `K1 基础 (${metrics.levelCounts.K1})` },
                      { id: 'K2', label: `K2 相关 (${metrics.levelCounts.K2})` },
                      { id: 'K3', label: `K3 陌生 (${metrics.levelCounts.K3})` },
                      { id: 'K4', label: `K4 论文专属 (${metrics.levelCounts.K4})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveLevelFilter(tab.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeLevelFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {filteredNodes.map((node) => (
                    <div
                      key={node.id}
                      className="p-4 space-y-2.5 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs font-mono-tabular text-slate-500">
                            <span className="font-semibold text-slate-900">{node.level}</span>
                            <span aria-hidden="true">·</span>
                            <span>{node.epistemicStatus}</span>
                            <span aria-hidden="true">·</span>
                            <span>{node.domain}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {node.conceptNameZh}{' '}
                            <span className="font-normal text-slate-500 text-xs">
                              ({node.conceptNameEn})
                            </span>
                          </h3>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded">
                            {(['K1', 'K2', 'K3', 'K4'] as KnowledgeLevel[]).map((lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() =>
                                  onUpdateNodeLevel(
                                    node.id,
                                    lvl,
                                    `用户在知识矩阵中手动将「${node.conceptNameZh}」调整为 ${lvl}`
                                  )
                                }
                                aria-label={`将 ${node.conceptNameZh} 设为 ${lvl}`}
                                className={`px-2 py-1 text-xs font-mono-tabular rounded transition-colors cursor-pointer ${
                                  node.level === lvl
                                    ? 'bg-slate-900 text-white font-semibold'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {lvl}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveNode(node.id)}
                            aria-label={`删除节点 ${node.conceptNameZh}`}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {node.formulaLatex && (
                        <div className="py-1.5 px-3 bg-slate-50 border border-slate-200/70 rounded text-xs overflow-x-auto">
                          <LatexBlock latex={node.formulaLatex} displayMode={false} />
                        </div>
                      )}

                      <p className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-medium text-slate-800">判定依据：</span>
                        <MixedAcademicText text={node.rationale} />
                      </p>

                      {node.lastUpdatedReason && (
                        <div className="text-xs text-blue-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>动态更新记录：{node.lastUpdatedReason}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

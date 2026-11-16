import React, { useState } from 'react';
import type {
  PaperPreAnalysis,
  ReadingMaterial,
  KnowledgeNode,
  AnnotationDetailLevel,
  TranslationProgressState,
  InProgressTranslationSnapshot,
} from '../types/physics';
import { getAnnotationDetailProfile } from '../utils/annotationSettings';
import { parseArxivAtomXml } from '../utils/arxivParser';
import { MixedAcademicText } from './LatexRenderer';
import { DiagnosticAlert } from './DiagnosticAlert';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  FileText,
  ShieldCheck,
  Upload,
  AlertCircle,
  SlidersHorizontal,
  Sparkles,
  Send,
  MessageSquare,
} from 'lucide-react';

interface PreAnalysisStageViewProps {
  materials: ReadingMaterial[];
  knowledgeNodes: KnowledgeNode[];
  currentPreAnalysis: PaperPreAnalysis | null;
  paperTitleEn: string;
  paperAuthors: string;
  paperArxivId: string;
  paperRawText: string;
  onChangePaperTitle: (val: string) => void;
  onChangePaperAuthors: (val: string) => void;
  onChangePaperArxivId: (val: string) => void;
  onChangePaperRawText: (val: string) => void;
  isPreAnalysisConfirmed: boolean;
  isTranslatingFull: boolean;
  translationProgress?: TranslationProgressState | null;
  translationError?: string | null;
  onPreAnalysisGenerated: (preAnalysis: PaperPreAnalysis) => void;
  onConfirmAndTranslate: () => Promise<void>;
  onBackToKnowledgeStage: () => void;
  annotationDetailLevel?: AnnotationDetailLevel;
  onOpenSettings?: () => void;
  inProgressTranslation?: InProgressTranslationSnapshot | null;
  onResumeIncompleteTranslation?: () => void;
  hasPartialTranslatedDocument?: boolean;
  onSwitchToTranslationTab?: () => void;
}

export const PreAnalysisStageView: React.FC<PreAnalysisStageViewProps> = ({
  materials,
  knowledgeNodes,
  currentPreAnalysis,
  paperTitleEn,
  paperAuthors,
  paperArxivId,
  paperRawText,
  onChangePaperTitle,
  onChangePaperAuthors,
  onChangePaperArxivId,
  onChangePaperRawText,
  isPreAnalysisConfirmed,
  isTranslatingFull,
  translationProgress,
  translationError,
  onPreAnalysisGenerated,
  onConfirmAndTranslate,
  onBackToKnowledgeStage,
  annotationDetailLevel = 3,
  onOpenSettings,
  inProgressTranslation = null,
  onResumeIncompleteTranslation,
  hasPartialTranslatedDocument = false,
  onSwitchToTranslationTab,
}) => {
  const detailProfile = getAnnotationDetailProfile(annotationDetailLevel);
  const [arxivSearchInput, setArxivSearchInput] = useState('');
  const [isFetchingArxiv, setIsFetchingArxiv] = useState(false);
  const [arxivError, setArxivError] = useState('');
  const [arxivWarning, setArxivWarning] = useState('');
  const [arxivSuccessMsg, setArxivSuccessMsg] = useState('');

  const [isRunningPreAnalysis, setIsRunningPreAnalysis] = useState(false);
  const [preAnalysisError, setPreAnalysisError] = useState('');

  // Interactive Pre-Analysis Reading Guide Q&A Assistant state
  const [guideQuestion, setGuideQuestion] = useState('');
  const [isAskingGuide, setIsAskingGuide] = useState(false);
  const [guideError, setGuideError] = useState('');
  const [guideTurns, setGuideTurns] = useState<
    Array<{ id: string; question: string; answer: string }>
  >([]);

  // PDF upload & preview state
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfWarning, setPdfWarning] = useState('');
  const [uploadedPdfName, setUploadedPdfName] = useState('');
  const [uploadedPdfPageCount, setUploadedPdfPageCount] = useState<number | null>(null);
  const [uploadedPdfObjectUrl, setUploadedPdfObjectUrl] = useState<string | null>(null);
  const [showOriginalPdfPreview, setShowOriginalPdfPreview] = useState(false);

  const handleAskPreAnalysisGuide = async (customQuestion?: string) => {
    if (!currentPreAnalysis || isAskingGuide) return;
    const q = (customQuestion ?? guideQuestion).trim();
    if (!q) return;

    setGuideError('');
    setIsAskingGuide(true);
    try {
      const resp = await fetch('/api/paper-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: q,
          chatHistory: guideTurns.slice(-4).flatMap((t) => [
            { role: 'user', content: t.question, locationLabel: '预分析导读' },
            { role: 'assistant', content: t.answer, locationLabel: '预分析导读' },
          ]),
          activeLocation: {
            sectionNumber: '0',
            sectionTitleZh: '预分析与全文导读路线',
            sectionTitleEn: 'Pre-Analysis & Reading Guide',
            paragraphId: 'pre-analysis-guide',
            paragraphIndex: 1,
            statementType: '核心结论',
            translatedZhText: currentPreAnalysis.coreInnovationSummary,
            originalEnExcerpt: paperRawText.slice(0, 900),
            equations: [],
          },
          documentContext: {
            titleZh: currentPreAnalysis.titleZh,
            titleEn: currentPreAnalysis.titleEn,
            authors: currentPreAnalysis.authors,
            abstractZh: currentPreAnalysis.coreInnovationSummary,
            allSectionTitles: (currentPreAnalysis.sectionGaps || []).map(
              (s) => `${s.sectionNumber} ${s.sectionTitleZh} (${s.sectionTitleEn})`
            ),
          },
          knowledgeNodes,
          materials,
          annotationDetailLevel,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Gemini 导读助手响应失败');
      }
      setGuideTurns((prev) => [
        ...prev,
        {
          id: `guide-${Date.now()}`,
          question: q,
          answer: data.replyMarkdown || '已完成针对该论文导读问题的分析。',
        },
      ]);
      if (!customQuestion) setGuideQuestion('');
    } catch (err) {
      setGuideError(err instanceof Error ? err.message : '导读助手请求异常，请稍后重试');
    } finally {
      setIsAskingGuide(false);
    }
  };

  const runArxivFetch = async () => {
    const cleanInput = arxivSearchInput.trim();
    if (!cleanInput) {
      setArxivError('请输入 arXiv 编号（如 hep-th/0603001、2301.00001）、arXiv 链接或英文论文标题。');
      return;
    }
    setArxivError('');
    setArxivWarning('');
    setArxivSuccessMsg('');
    setIsFetchingArxiv(true);
    try {
      let resp = await fetch('/api/fetch-arxiv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxivInput: cleanInput }),
      });

      // Fallback 1: If POST /api/fetch-arxiv returned 404/405 in a proxy environment, try GET
      if (resp.status === 404 || resp.status === 405) {
        resp = await fetch(`/api/fetch-arxiv?arxivInput=${encodeURIComponent(cleanInput)}`);
      }

      if (resp.ok) {
        const data = await resp.json();
        onChangePaperTitle(data.title || cleanInput);
        onChangePaperAuthors(data.authors || '');
        onChangePaperArxivId(data.uri || cleanInput);
        onChangePaperRawText(data.fullTextSections || data.abstractText || '');
        if (data.extractionWarning) {
          setArxivWarning(data.extractionWarning);
        } else {
          setArxivSuccessMsg(
            `已成功从互联网（arXiv / ar5iv）拉取论文《${data.title}》的章节与公式文本（共 ${(data.fullTextSections || '').length} 字符）！`
          );
        }
        return;
      }

      // Fallback 2: Direct client-side HTTPS query to official export.arxiv.org API
      const cleanIdMatch = cleanInput.match(
        /(?:arxiv:|abs\/|pdf\/|html\/)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i
      );
      const directUrl = cleanIdMatch
        ? `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanIdMatch[1])}`
        : `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanInput)}&start=0&max_results=1`;
      const directResp = await fetch(directUrl);
      if (directResp.ok) {
        const xmlText = await directResp.text();
        const parsedPapers = parseArxivAtomXml(xmlText, { limit: 1 });
        if (parsedPapers.length > 0) {
          const top = parsedPapers[0];
          onChangePaperTitle(top.title);
          onChangePaperAuthors(top.authors.join(', '));
          onChangePaperArxivId(top.absUrl || `arXiv:${top.arxivId}`);
          onChangePaperRawText(`Abstract\n${top.abstractSummary}`);
          setArxivSuccessMsg(
            `已通过 arXiv 官方接口拉取论文《${top.title}》元数据与摘要（共 ${top.abstractSummary.length} 字符）！`
          );
          return;
        }
      }

      let errorData: { error?: string } = {};
      try {
        errorData = await resp.json();
      } catch {
        // Ignore non-JSON body
      }
      throw new Error(errorData.error || '未能从 arXiv 获取该文献，请检查编号或直接上传 PDF');
    } catch (err) {
      setArxivError(err instanceof Error ? err.message : '拉取 arXiv 论文失败');
    } finally {
      setIsFetchingArxiv(false);
    }
  };

  const handleFetchArxiv = async (e: React.FormEvent) => {
    e.preventDefault();
    await runArxivFetch();
  };

  const processSelectedFile = async (file: File) => {
    setPreAnalysisError('');
    setArxivError('');
    setArxivWarning('');
    setPdfWarning('');
    setArxivSuccessMsg('');

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      setIsParsingPdf(true);
      try {
        if (uploadedPdfObjectUrl) {
          URL.revokeObjectURL(uploadedPdfObjectUrl);
        }
        const objUrl = URL.createObjectURL(file);
        setUploadedPdfObjectUrl(objUrl);
        setUploadedPdfName(file.name);

        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('读取 PDF 文件失败'));
          reader.readAsDataURL(file);
        });

        const resp = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            pdfBase64: base64Data,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'PDF 论文解析失败');
        }

        if (data.titleEn) onChangePaperTitle(data.titleEn);
        if (data.authors) onChangePaperAuthors(data.authors);
        if (data.arxivIdOrDoi) onChangePaperArxivId(data.arxivIdOrDoi);
        if (data.extractedText) onChangePaperRawText(data.extractedText);
        setUploadedPdfPageCount(data.pageCount || 1);
        if (data.extractionWarning) {
          setPdfWarning(data.extractionWarning);
        }

        setArxivSuccessMsg(
          `已成功导入并解析 PDF 论文「${file.name}」（共 ${data.pageCount || 1} 页，提取标题《${data.titleEn || file.name}》及正文公式共 ${(data.extractedText || '').length} 字符）！请点击下方「开始论文预分析与逐章缺口诊断」。`
        );
      } catch (err) {
        setPreAnalysisError(
          err instanceof Error ? err.message : '解析 PDF 文件失败，请检查文件是否完整。'
        );
      } finally {
        setIsParsingPdf(false);
      }
      return;
    }

    // Standard text / LaTeX (.tex / .txt / .md) file
    try {
      const text = await file.text();
      if (!paperTitleEn) {
        onChangePaperTitle(file.name.replace(/\.(tex|txt|md)$/i, ''));
      }
      onChangePaperRawText(text);
      setUploadedPdfName('');
      setUploadedPdfPageCount(null);
      setArxivSuccessMsg(`已成功读取本地文件「${file.name}」（共 ${text.length} 字符）。`);
    } catch {
      setPreAnalysisError('读取本地文件失败，请确认文件为 PDF (.pdf) 或 LaTeX/文本 (.tex/.txt/.md) 格式。');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
    e.target.value = '';
  };

  const executePreAnalysis = async () => {
    if (!paperRawText.trim()) {
      setPreAnalysisError('请先上传本地 PDF / .tex / .txt 论文文件、通过 arXiv 检索拉取论文，或在文本框中粘贴待翻译的英文理论物理论文内容。');
      return;
    }
    setPreAnalysisError('');
    setIsRunningPreAnalysis(true);

    try {
      const resp = await fetch('/api/process-custom-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'pre_analyze',
          titleEn: paperTitleEn.trim() || 'Theoretical Physics Paper',
          authors: paperAuthors.trim(),
          arxivIdOrDoi: paperArxivId.trim(),
          rawEnglishText: paperRawText.trim(),
          materials,
          knowledgeNodes,
          annotationDetailLevel,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '论文预分析请求失败');
      }
      onPreAnalysisGenerated(data.preAnalysis);
    } catch (err) {
      setPreAnalysisError(err instanceof Error ? err.message : '论文预分析执行失败');
    } finally {
      setIsRunningPreAnalysis(false);
    }
  };

  const handleRunPreAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePreAnalysis();
  };

  return (
    <div className="space-y-8">
      {/* Stage 2 Header */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs font-mono-tabular text-slate-500">
              工作流程第三、四步 · 导入待译英文理论物理论文（支持 PDF / arXiv / LaTeX）并对照个人知识模型执行预分析
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              待译论文导入（支持 PDF 全文解析）与逐章知识缺口预分析
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              严格遵循工作流原则：<strong className="font-semibold text-slate-900">收到材料后，首先建立个人知识背景模型，再开始论文预分析。未经您的确认，绝不直接开始全文翻译</strong>。
            </p>
          </div>

          {currentPreAnalysis && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={onConfirmAndTranslate}
                disabled={isTranslatingFull}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isTranslatingFull ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在执行全文深度翻译与精准批注...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {isPreAnalysisConfirmed
                        ? '已确认预分析 · 查看中文深度批注文稿'
                        : '确认预分析方案，开始全文深度翻译'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {materials.length === 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 bg-amber-50/70 p-3.5 rounded border border-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                提示：您尚未在「1. 知识背景建模」中录入已读教材。建议先录入您的个人阅读材料，以便系统精准过滤 K1 已知知识并定位 K3 缺口。
              </span>
            </div>
            <button
              type="button"
              onClick={onBackToKnowledgeStage}
              className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 font-medium rounded hover:bg-amber-100/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              返回第一步录入已读教材
            </button>
          </div>
        )}
      </section>

      {/* Paper Import & Input Workbench */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              提供待翻译的英文理论物理论文（支持直接导入 PDF 论文文件）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              支持直接上传本地 <strong className="text-slate-800">.pdf 论文文件</strong>（自动提取正文并还原 LaTeX 公式）、通过 arXiv 编号实时拉取全文，或上传 .tex / .txt 源码文件。
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {uploadedPdfObjectUrl && (
              <button
                type="button"
                onClick={() => setShowOriginalPdfPreview((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {showOriginalPdfPreview
                    ? '收起原版 PDF 预览'
                    : `预览已导入 PDF (${uploadedPdfPageCount || 1}页)`}
                </span>
              </button>
            )}

            <label
              htmlFor="upload-paper-file"
              className={`inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                isParsingPdf ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              {isParsingPdf ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在解析 PDF 全文与公式...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>导入本地 PDF / .tex / .txt 论文</span>
                </>
              )}
              <input
                id="upload-paper-file"
                type="file"
                accept=".pdf,application/pdf,.tex,.txt,.md"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Uploaded PDF Metadata Banner & Optional Embedded Original PDF Viewer */}
        {uploadedPdfName && (
          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-blue-950 font-medium">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  当前已加载 PDF 论文文件：<strong>{uploadedPdfName}</strong>
                  {uploadedPdfPageCount ? `（共 ${uploadedPdfPageCount} 页）` : ''}
                </span>
              </div>
              {uploadedPdfObjectUrl && (
                <button
                  type="button"
                  onClick={() => setShowOriginalPdfPreview((prev) => !prev)}
                  className="text-blue-700 hover:text-blue-900 font-medium underline cursor-pointer self-start sm:self-auto"
                >
                  {showOriginalPdfPreview ? '隐藏原始 PDF 页面视图' : '展开查看原始 PDF 页面视图'}
                </button>
              )}
            </div>

            {showOriginalPdfPreview && uploadedPdfObjectUrl && (
              <div className="border border-slate-300 rounded overflow-hidden bg-slate-800 h-[440px]">
                <iframe
                  src={uploadedPdfObjectUrl}
                  title={`原始 PDF 预览: ${uploadedPdfName}`}
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </div>
        )}

        {/* Method A: Live arXiv Full-Text / Abstract Fetcher */}
        <form
          onSubmit={handleFetchArxiv}
          className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3"
        >
          <div className="text-xs font-semibold text-slate-900">
            方式一：直接点击右上角「导入本地 PDF / .tex / .txt 论文」，或通过下方 arXiv 编号实时从互联网拉取全文
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="arxiv-live-input" className="sr-only">
              arXiv 编号、URL 或英文论文标题
            </label>
            <input
              id="arxiv-live-input"
              type="text"
              value={arxivSearchInput}
              onChange={(e) => setArxivSearchInput(e.target.value)}
              placeholder="输入 arXiv 编号（如 hep-th/0603001、hep-th/9711200、2301.00001）或英文标题"
              className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={isFetchingArxiv}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isFetchingArxiv ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>{isFetchingArxiv ? '正在从 arXiv 实时抓取全文...' : '从 arXiv 联网拉取论文'}</span>
            </button>
          </div>
          {arxivError && (
            <DiagnosticAlert
              variant="error"
              title="arXiv 论文拉取失败"
              message={arxivError}
              retryLabel="重试拉取"
              isRetrying={isFetchingArxiv}
              onRetry={runArxivFetch}
            />
          )}
          {arxivWarning && (
            <DiagnosticAlert
              variant="degraded"
              title="全文拉取不完整（已降级导入摘要）"
              message={arxivWarning}
              retryLabel="重试拉取全文"
              isRetrying={isFetchingArxiv}
              onRetry={runArxivFetch}
            />
          )}
          {pdfWarning && (
            <DiagnosticAlert
              variant="degraded"
              title="PDF 公式恢复降级（已保留本地提取文本）"
              message={pdfWarning}
            />
          )}
          {arxivSuccessMsg && (
            <div className="text-xs text-emerald-700 font-medium">{arxivSuccessMsg}</div>
          )}
        </form>

        {/* Method B: Direct Paper Metadata & Body Editor */}
        <form onSubmit={handleRunPreAnalysis} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="paper-title-en" className="block text-xs font-medium text-slate-700 mb-1">
                英文论文标题
              </label>
              <input
                id="paper-title-en"
                type="text"
                value={paperTitleEn}
                onChange={(e) => onChangePaperTitle(e.target.value)}
                placeholder="例如：Holographic Derivation of Entanglement Entropy from AdS/CFT"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="paper-authors" className="block text-xs font-medium text-slate-700 mb-1">
                论文作者
              </label>
              <input
                id="paper-authors"
                type="text"
                value={paperAuthors}
                onChange={(e) => onChangePaperAuthors(e.target.value)}
                placeholder="例如：Shinsei Ryu, Tadashi Takayanagi"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="paper-arxiv-id" className="block text-xs font-medium text-slate-700 mb-1">
                arXiv 编号或 DOI
              </label>
              <input
                id="paper-arxiv-id"
                type="text"
                value={paperArxivId}
                onChange={(e) => onChangePaperArxivId(e.target.value)}
                placeholder="例如：arXiv:hep-th/0603001"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="paper-raw-body" className="block text-xs font-medium text-slate-700">
                待翻译的英文理论物理论文正文（支持含 LaTeX 公式的章节或全文）*
              </label>
              <span className="text-xs font-mono-tabular text-slate-400">
                当前字符数：{paperRawText.length}
              </span>
            </div>
            <textarea
              id="paper-raw-body"
              rows={10}
              value={paperRawText}
              onChange={(e) => onChangePaperRawText(e.target.value)}
              placeholder="在此粘贴您需要翻译和批注的英文理论物理论文正文（支持标准 LaTeX 数学公式如 \mathcal{L}、\int \mathcal{D}\phi 等），或使用上方 arXiv 检索自动拉取..."
              className="w-full px-3.5 py-3 text-xs sm:text-sm font-mono-tabular bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
            />
          </div>

          {preAnalysisError && (
            <DiagnosticAlert
              variant="error"
              title="论文预分析执行失败"
              message={preAnalysisError}
              retryLabel="重试预分析"
              isRetrying={isRunningPreAnalysis}
              onRetry={executePreAnalysis}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>
                当前全局批注详略：<strong className="text-slate-800">Lv.{detailProfile.level} {detailProfile.shortLabel}</strong>（{detailProfile.derivationStepHint}）
              </span>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>在设置中调节</span>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isRunningPreAnalysis}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRunningPreAnalysis ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>正在对照您的个人知识模型执行论文预分析...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>开始论文预分析与逐章缺口诊断</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Pre-Analysis Output & Confirmation Gate */}
      {currentPreAnalysis && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="space-y-1">
              <div className="text-xs font-mono-tabular text-blue-600 font-semibold">
                论文预分析报告已生成 · 等待您确认批注策略
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                <MixedAcademicText text={currentPreAnalysis.titleZh} />
              </h2>
              <div className="text-xs text-slate-500">
                原文标题：<MixedAcademicText text={currentPreAnalysis.titleEn} /> · 作者：{currentPreAnalysis.authors} · 标识：{currentPreAnalysis.arxivIdOrDoi}
              </div>
            </div>

            <div className="text-xs font-mono-tabular text-slate-600 shrink-0">
              难度定位：<strong className="text-slate-900">{currentPreAnalysis.overallDifficulty}</strong>
            </div>
          </div>

          {currentPreAnalysis.generationMeta?.degraded && (
            <DiagnosticAlert
              variant="degraded"
              title="预分析已降级为本地章节结构识别（Gemini 未完成完整缺口诊断）"
              message={
                currentPreAnalysis.generationMeta.reason ||
                '当前仅基于您输入的原文识别了章节切片，建议点击右侧按钮重试获取 Gemini 语义诊断。'
              }
              meta={currentPreAnalysis.generationMeta}
              retryLabel="重新调用 Gemini 预分析"
              isRetrying={isRunningPreAnalysis}
              onRetry={executePreAnalysis}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                一、研究方向与论文核心机制概述
              </h3>
              <div className="text-xs font-mono-tabular text-slate-600">
                研究方向：{currentPreAnalysis.researchDirection}
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">
                <MixedAcademicText text={currentPreAnalysis.coreInnovationSummary} />
              </p>
            </div>

            <div className="lg:col-span-5 p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                二、论文所需数学工具与您个人储备的对照
              </h3>
              <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                {(currentPreAnalysis.mathPrerequisitesRequired || []).map((mp, idx) => (
                  <li key={idx}>
                    <MixedAcademicText text={mp} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Section-by-Section Knowledge Gap Matrix */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                三、对照个人知识模型（K1–K4）的逐章知识缺口诊断与批注计划
              </h3>
              <span className="text-xs font-mono-tabular text-slate-500">
                核心原则：K1 已知内容绝不赘述，K3/K4 核心障碍深入推导
              </span>
            </div>

            <div className="space-y-4">
              {(currentPreAnalysis.sectionGaps || []).map((sec, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-xs font-mono-tabular text-slate-500">
                        <span>{sec.sectionNumber}</span>
                        <span aria-hidden="true"> · </span>
                        <span>难度：{sec.difficulty}</span>
                        <span aria-hidden="true"> · </span>
                        <span>预计精选深度批注：{sec.plannedAnnotationCount} 条</span>
                      </div>
                      <h4 className="text-base font-bold text-slate-900 mt-0.5">
                        <MixedAcademicText text={sec.sectionTitleZh} />{' '}
                        <span className="text-xs font-normal text-slate-500">
                          (<MixedAcademicText text={sec.sectionTitleEn} />)
                        </span>
                      </h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200/70 rounded space-y-1.5">
                      <div className="font-semibold text-slate-700">
                        ● 本节已掌握基础 (K1 · 将跳过批注)
                      </div>
                      <ul className="space-y-1 text-slate-600 list-disc pl-4">
                        {(sec.k1ConceptsToSkip || []).map((c, i) => (
                          <li key={i}>
                            <MixedAcademicText text={c} />
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-amber-50/40 border border-amber-200/80 rounded space-y-1.5">
                      <div className="font-semibold text-amber-900">
                        ▲ 本节陌生知识缺口 (K3 · 重点补充推导)
                      </div>
                      <ul className="space-y-1 text-slate-800 list-disc pl-4">
                        {(sec.k3UnknownGaps || []).map((c, i) => (
                          <li key={i}>
                            <MixedAcademicText text={c} />
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-blue-50/40 border border-blue-200/80 rounded space-y-1.5">
                      <div className="font-semibold text-blue-900">
                        ◆ 论文专属核心机制 (K4 · 深度拆解)
                      </div>
                      {(sec.k4PaperSpecificInnovations || []).length > 0 ? (
                        <ul className="space-y-1 text-slate-800 list-disc pl-4">
                          {(sec.k4PaperSpecificInnovations || []).map((c, i) => (
                            <li key={i}>
                              <MixedAcademicText text={c} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-slate-500">本节以 K3 前置衔接与数学结构还原为主。</div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 pt-1">
                    <span className="font-semibold text-slate-900">本节精准批注策略：</span>
                    <MixedAcademicText text={sec.gapAnalysisSummary} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Pre-Analysis Gemini Reading Guide Assistant */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900">
                  四、Gemini 导读助手（读前答疑、缺口探查与精读路线规划）
                </h3>
              </div>
              <span className="text-xs font-mono-tabular text-slate-500">
                可在开始全文翻译前向导读助手追问核心物理图像、章节取舍与前置数学准备
              </span>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">一键向导读助手提问：</span>
                {[
                  '这篇论文最核心的物理突破与物理图像是什么？',
                  '结合我的 K1–K4 知识背景，建议我按什么顺序精读各章节？',
                  '哪些 K3 数学前置工具需要我在读正文推导前优先补齐？',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isAskingGuide}
                    onClick={() => handleAskPreAnalysisGuide(preset)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded text-xs font-medium transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3 text-blue-600 shrink-0" />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>

              {guideTurns.length > 0 && (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {guideTurns.map((turn) => (
                    <div
                      key={turn.id}
                      className="p-3.5 bg-white border border-slate-200 rounded-md space-y-2 text-xs sm:text-sm"
                    >
                      <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                        <span>您的导读提问：</span>
                        <span>{turn.question}</span>
                      </div>
                      <div className="text-slate-800 leading-relaxed whitespace-pre-line pt-1 border-t border-slate-100">
                        <MixedAcademicText text={turn.answer} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isAskingGuide && (
                <div className="p-3 bg-white border border-slate-200 rounded-md text-xs text-slate-600 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                  <span>Gemini 导读助手正在结合《{currentPreAnalysis.titleZh}》与您的知识模型生成导读解答...</span>
                </div>
              )}

              {guideError && (
                <DiagnosticAlert
                  variant="error"
                  title="Gemini 导读助手响应异常"
                  message={guideError}
                  retryLabel="重试提问"
                  isRetrying={isAskingGuide}
                  onRetry={() => handleAskPreAnalysisGuide(guideQuestion || '请概述本文的核心导读路线')}
                />
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskPreAnalysisGuide();
                }}
                className="flex gap-2"
              >
                <label htmlFor="pre-analysis-guide-input" className="sr-only">
                  向 Gemini 预分析导读助手提问
                </label>
                <input
                  id="pre-analysis-guide-input"
                  type="text"
                  value={guideQuestion}
                  onChange={(e) => setGuideQuestion(e.target.value)}
                  placeholder={`针对《${currentPreAnalysis.titleZh}》的导读路线、数学工具或物理背景随时提问...`}
                  className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={isAskingGuide || !guideQuestion.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>询问导读助手</span>
                </button>
              </form>
            </div>
          </div>

          {(currentPreAnalysis.groundingSources || []).length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-mono-tabular text-slate-500">
                本论文预分析联网核验的权威文献源：
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(currentPreAnalysis.groundingSources || []).map((src, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{src.title}</div>
                      {src.snippet && <div className="text-slate-600 line-clamp-2">{src.snippet}</div>}
                    </div>
                    <a
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline shrink-0"
                    >
                      <span>链接</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {translationError && (
            <DiagnosticAlert
              variant="error"
              title="全文分节翻译启动或执行异常"
              message={translationError}
              retryLabel="重试全文翻译"
              isRetrying={isTranslatingFull}
              onRetry={onConfirmAndTranslate}
            />
          )}

          {/* Breakpoint Resume Banner when an interrupted translation snapshot exists */}
          {!isTranslatingFull &&
            inProgressTranslation &&
            (() => {
              const completedCount = inProgressTranslation.outcomes.filter(
                (o) =>
                  o.status === 'completed' || o.status === 'degraded' || o.status === 'failed'
              ).length;
              const totalCount = inProgressTranslation.chunks.length;
              if (completedCount === 0 || completedCount >= totalCount) return null;
              return (
                <div
                  data-testid="resume-translation-banner"
                  className="p-4 bg-amber-50/90 border border-amber-300 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-amber-950">
                      ● 检测到未完成的分节翻译进度：《
                      {inProgressTranslation.titleZh || inProgressTranslation.titleEn}》（已自动保存{' '}
                      {completedCount} / {totalCount} 节）
                    </div>
                    <div className="text-amber-800">
                      您可以直接前往阅读已译完的 {completedCount} 节内容，或点击右侧按钮从第{' '}
                      {completedCount + 1} 节继续断点续译（无需重头翻译）。
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {hasPartialTranslatedDocument && onSwitchToTranslationTab && (
                      <button
                        type="button"
                        onClick={onSwitchToTranslationTab}
                        className="px-3 py-2 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-medium rounded-md transition-colors cursor-pointer"
                      >
                        阅读已译 {completedCount} 节文稿
                      </button>
                    )}
                    {onResumeIncompleteTranslation && (
                      <button
                        type="button"
                        onClick={onResumeIncompleteTranslation}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>从第 {completedCount + 1} 节继续续译</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

          {isTranslatingFull && translationProgress && (
            <div
              data-testid="chunked-translation-progress"
              className="border border-blue-200 bg-blue-50/40 rounded-md p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                  <span>
                    正在分节深度翻译（边译边存防丢失流水线）：{translationProgress.currentSectionLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular text-blue-700 font-semibold">
                    已完成 {translationProgress.currentChunk} / {translationProgress.totalChunks} 节
                  </span>
                  {translationProgress.currentChunk >= 1 &&
                    hasPartialTranslatedDocument &&
                    onSwitchToTranslationTab && (
                      <button
                        type="button"
                        onClick={onSwitchToTranslationTab}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors cursor-pointer"
                      >
                        <span>边译边读：先看已译 {translationProgress.currentChunk} 节</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                </div>
              </div>

              <progress
                value={translationProgress.currentChunk}
                max={Math.max(1, translationProgress.totalChunks)}
                className="w-full h-2 accent-blue-600 rounded overflow-hidden block"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] font-mono-tabular">
                {translationProgress.chunks.map((c) => (
                  <div
                    key={c.chunkIndex}
                    className={`px-2.5 py-1.5 border rounded flex items-center justify-between gap-2 ${
                      c.status === 'completed'
                        ? 'bg-white border-emerald-200 text-emerald-800'
                        : c.status === 'degraded' || c.status === 'failed'
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : c.status === 'running'
                        ? 'bg-white border-blue-300 text-blue-800'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className="truncate">
                      §{c.sectionNumber} {c.sectionTitleEn}
                    </span>
                    <span className="shrink-0">
                      {c.status === 'completed'
                        ? '● 已存'
                        : c.status === 'running'
                        ? '⟳ 翻译中'
                        : c.status === 'degraded'
                        ? '▲ 降级已存'
                        : c.status === 'failed'
                        ? '◆ 失败已存'
                        : '○ 待译'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Confirmation Call-To-Action */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                未经您的确认，系统不会擅自开始全文翻译。请核对上方缺口诊断无误后点击右侧按钮开始深度翻译。
              </span>
            </div>
            <button
              type="button"
              onClick={onConfirmAndTranslate}
              disabled={isTranslatingFull}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isTranslatingFull ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>正在逐章生成纯中文深度学术翻译与五类精准批注...</span>
                </>
              ) : (
                <>
                  <span>我已确认预分析方案，开始全文深度翻译与批注</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
  ReadingMaterial,
  KnowledgeNode,
  KnowledgeAnalysisReport,
  PaperPreAnalysis,
  TranslatedPaperDocument,
  DynamicFeedbackEvent,
  KnowledgeLevel,
  ChapterScopeItem,
  PrecisionAnnotation,
  ActiveWorkspaceTab,
  PaperChatTurn,
  PersistedWorkspaceState,
  DerivationMindMapTree,
  AnnotationDetailLevel,
  ChunkTranslationOutcome,
  TranslationProgressState,
  PaperSectionChunk,
  InProgressTranslationSnapshot,
  ArchivedPaperEntry,
} from './types/physics';
import {
  applyDynamicKnowledgeFeedback,
  exportAcademicMarkdown,
} from './utils/knowledgeEngine';
import { rebuildMaterialFromChapterBreakdown } from './utils/scopeParser';
import {
  splitPaperIntoSectionChunks,
  buildFallbackSectionFromChunk,
  mergeTranslatedSectionChunks,
  getRecommendedChunkBudget,
  normalizeTranslatedPaperDocument,
  normalizePrecisionAnnotation,
} from './utils/paperChunker';
import {
  DEFAULT_ANNOTATION_DETAIL_LEVEL,
  DEFAULT_MANUSCRIPT_WIDTH_PERCENT,
  getAnnotationDetailProfile,
} from './utils/annotationSettings';
import {
  loadSavedWorkspace,
  saveWorkspaceState,
  clearSavedWorkspace,
  upsertPaperChatTurns,
  upsertArchivedPaper,
  removeArchivedPaper,
} from './utils/workspacePersistence';
import { KnowledgeStageView } from './components/KnowledgeStageView';
import { SettingsModal } from './components/SettingsModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const PreAnalysisStageView = lazy(() =>
  import('./components/PreAnalysisStageView').then((m) => ({ default: m.PreAnalysisStageView }))
);
const TranslationDocumentView = lazy(() =>
  import('./components/TranslationDocumentView').then((m) => ({
    default: m.TranslationDocumentView,
  }))
);
const TerminologyAndVerificationView = lazy(() =>
  import('./components/TerminologyAndVerificationView').then((m) => ({
    default: m.TerminologyAndVerificationView,
  }))
);
const PaperHistoryModal = lazy(() =>
  import('./components/PaperHistoryModal').then((m) => ({ default: m.PaperHistoryModal }))
);
import {
  X,
  Copy,
  Check,
  Download,
  ArrowRight,
  BookOpen,
  FileText,
  SlidersHorizontal,
  History,
} from 'lucide-react';

export type { PersistedWorkspaceState };

export default function App() {
  const saved = React.useMemo(() => loadSavedWorkspace(), []);

  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>(
    saved?.activeTab ?? 'knowledge'
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

  // Stage 1 State: 100% Blank on first visit, persisted to localStorage as user works
  const [materials, setMaterials] = useState<ReadingMaterial[]>(saved?.materials ?? []);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>(
    saved?.knowledgeNodes ?? []
  );
  const [report, setReport] = useState<KnowledgeAnalysisReport | null>(saved?.report ?? null);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Stage 2 State: Paper Input & Pre-Analysis
  const [paperTitleEn, setPaperTitleEn] = useState<string>(saved?.paperTitleEn ?? '');
  const [paperAuthors, setPaperAuthors] = useState<string>(saved?.paperAuthors ?? '');
  const [paperArxivId, setPaperArxivId] = useState<string>(saved?.paperArxivId ?? '');
  const [paperRawText, setPaperRawText] = useState<string>(saved?.paperRawText ?? '');
  const [currentPreAnalysis, setCurrentPreAnalysis] = useState<PaperPreAnalysis | null>(
    saved?.currentPreAnalysis ?? null
  );
  const [isPreAnalysisConfirmed, setIsPreAnalysisConfirmed] = useState<boolean>(
    saved?.isPreAnalysisConfirmed ?? false
  );

  // Stage 3 & 4 State: Full Translated & Annotated Document
  const [currentDocument, setCurrentDocument] = useState<TranslatedPaperDocument | null>(
    saved?.currentDocument ?? null
  );
  const [isTranslatingFull, setIsTranslatingFull] = useState<boolean>(false);
  const [translationProgress, setTranslationProgress] =
    useState<TranslationProgressState | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [retryingChunkIndices, setRetryingChunkIndices] = useState<number[]>([]);

  // Stage 6 State: Dynamic Knowledge Feedback History
  const [feedbackHistory, setFeedbackHistory] = useState<DynamicFeedbackEvent[]>(
    saved?.feedbackHistory ?? []
  );
  // Persisted Gemini Companion Chat History & Active Paragraph Map keyed by paperId
  const [paperChatHistory, setPaperChatHistory] = useState<Record<string, PaperChatTurn[]>>(
    saved?.paperChatHistory ?? {}
  );
  const [activeParagraphByPaperId, setActiveParagraphByPaperId] = useState<
    Record<string, string>
  >(saved?.activeParagraphByPaperId ?? {});
  const [derivationMindMapsByPaperId, setDerivationMindMapsByPaperId] = useState<
    Record<string, Record<string, DerivationMindMapTree>>
  >(saved?.derivationMindMapsByPaperId ?? {});
  const [annotationDetailLevel, setAnnotationDetailLevel] = useState<AnnotationDetailLevel>(
    saved?.settings?.annotationDetailLevel ?? DEFAULT_ANNOTATION_DETAIL_LEVEL
  );
  const [manuscriptWidthPercent, setManuscriptWidthPercent] = useState<number>(
    saved?.settings?.manuscriptWidthPercent ?? DEFAULT_MANUSCRIPT_WIDTH_PERCENT
  );
  const [inProgressTranslation, setInProgressTranslation] =
    useState<InProgressTranslationSnapshot | null>(saved?.inProgressTranslation ?? null);
  const [savedPapersArchive, setSavedPapersArchive] = useState<ArchivedPaperEntry[]>(
    saved?.savedPapersArchive ?? []
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  // Persist user's workspace changes to localStorage
  useEffect(() => {
    const stateToSave: PersistedWorkspaceState = {
      materials,
      knowledgeNodes,
      report,
      currentPreAnalysis,
      currentDocument,
      paperTitleEn,
      paperAuthors,
      paperArxivId,
      paperRawText,
      isPreAnalysisConfirmed,
      feedbackHistory,
      paperChatHistory,
      activeParagraphByPaperId,
      activeTab,
      derivationMindMapsByPaperId,
      settings: {
        annotationDetailLevel,
        manuscriptWidthPercent,
      },
      inProgressTranslation,
      savedPapersArchive,
    };
    saveWorkspaceState(stateToSave);
  }, [
    materials,
    knowledgeNodes,
    report,
    currentPreAnalysis,
    currentDocument,
    paperTitleEn,
    paperAuthors,
    paperArxivId,
    paperRawText,
    isPreAnalysisConfirmed,
    feedbackHistory,
    paperChatHistory,
    activeParagraphByPaperId,
    activeTab,
    derivationMindMapsByPaperId,
    annotationDetailLevel,
    manuscriptWidthPercent,
    inProgressTranslation,
    savedPapersArchive,
  ]);

  const showToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 5500);
  };

  const handleClearAllWorkspace = () => {
    setMaterials([]);
    setKnowledgeNodes([]);
    setReport(null);
    setPaperTitleEn('');
    setPaperAuthors('');
    setPaperArxivId('');
    setPaperRawText('');
    setCurrentPreAnalysis(null);
    setCurrentDocument(null);
    setIsPreAnalysisConfirmed(false);
    setFeedbackHistory([]);
    setPaperChatHistory({});
    setActiveParagraphByPaperId({});
    setDerivationMindMapsByPaperId({});
    setInProgressTranslation(null);
    setSavedPapersArchive([]);
    setAnnotationDetailLevel(DEFAULT_ANNOTATION_DETAIL_LEVEL);
    setActiveTab('knowledge');
    clearSavedWorkspace();
    showToast('已清空重置全部工作区数据，您可以从零开始录入新的阅读书目与待译论文。');
  };

  const handleAutoRepairWorkspaceState = () => {
    setCurrentDocument((prev) => normalizeTranslatedPaperDocument(prev));
    setSavedPapersArchive((prev) =>
      (prev || [])
        .map((entry) => {
          const normDoc = normalizeTranslatedPaperDocument(entry.document);
          return normDoc ? { ...entry, document: normDoc } : null;
        })
        .filter((e): e is ArchivedPaperEntry => e !== null)
    );
    showToast('已完成文稿数据结构自动修复与缺省数组补齐，您可以继续正常阅读。');
  };

  const handleAddMaterial = (newMat: ReadingMaterial, newNodes: KnowledgeNode[]) => {
    setMaterials((prev) => [newMat, ...prev]);
    if (newNodes.length > 0) {
      setKnowledgeNodes((prev) => [...newNodes, ...prev]);
    }
    showToast(
      `已通过联网检索核验并录入《${newMat.title}》（实际阅读范围：${newMat.readScope}），拆解出 ${newNodes.length} 个知识分级节点。`
    );
  };

  const handleUpdateMaterialBreakdown = (
    materialId: string,
    newBreakdown: ChapterScopeItem[]
  ) => {
    const targetMat = materials.find((m) => m.id === materialId);
    if (!targetMat) return;
    const { updatedMaterial, rebuiltNodesForMaterial } =
      rebuildMaterialFromChapterBreakdown(targetMat, newBreakdown);
    setMaterials((prev) =>
      prev.map((m) => (m.id === materialId ? updatedMaterial : m))
    );
    setKnowledgeNodes((prev) => [
      ...rebuiltNodesForMaterial,
      ...prev.filter((n) => !n.sourceMaterialIds.includes(materialId)),
    ]);
    showToast(
      `已更新《${targetMat.title}》的章节级阅读范围映射：${updatedMaterial.parsedScopeSummary}`
    );
  };

  const handleRemoveMaterial = (id: string) => {
    const target = materials.find((m) => m.id === id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    setKnowledgeNodes((prev) => prev.filter((n) => !n.sourceMaterialIds.includes(id)));
    if (target) {
      showToast(`已从个人知识背景库移除《${target.title}》及其关联节点。`);
    }
  };

  const handleAddCustomNode = (node: KnowledgeNode) => {
    setKnowledgeNodes((prev) => [node, ...prev]);
    showToast(`已手动添加知识节点「${node.conceptNameZh} (${node.level})」。`);
  };

  const handleRemoveNode = (nodeId: string) => {
    setKnowledgeNodes((prev) => prev.filter((n) => n.id !== nodeId));
  };

  const handleUpdateNodeLevel = (
    nodeId: string,
    newLevel: KnowledgeLevel,
    reason: string
  ) => {
    const targetNode = knowledgeNodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const prevLevel = targetNode.level;
    setKnowledgeNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              level: newLevel,
              epistemicStatus: newLevel === 'K1' ? '已学习知识' : n.epistemicStatus,
              lastUpdatedReason: reason,
            }
          : n
      )
    );

    const fbEvent: DynamicFeedbackEvent = {
      id: `fb-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      conceptZh: targetNode.conceptNameZh,
      conceptEn: targetNode.conceptNameEn,
      previousLevel: prevLevel,
      newLevel,
      feedbackType: newLevel === 'K1' ? 'mastered' : 'prerequisite_gap',
      reason,
      effectOnDocument:
        newLevel === 'K1'
          ? `已将「${targetNode.conceptNameZh}」设为 K1 基础知识，正文中对应基础批注将自动省去。`
          : `已将「${targetNode.conceptNameZh}」设为 ${newLevel}，正文中对应深度批注将强制展开。`,
    };
    setFeedbackHistory((prev) => [fbEvent, ...prev]);
    showToast(fbEvent.effectOnDocument);
  };

  const handleGenerateReport = async () => {
    if (materials.length === 0) {
      showToast('请先在左侧录入至少一部您已阅读过的教材或论文。');
      return;
    }
    setReportError(null);
    setIsGeneratingReport(true);
    try {
      const resp = await fetch('/api/generate-knowledge-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materials, knowledgeNodes }),
      });
      const data = await resp.json();
      if (resp.ok && data.report) {
        setReport(data.report);
        if (data.report.generationMeta?.degraded) {
          showToast(
            `▲ 《个人知识背景分析报告》已生成（部分降级：${data.report.generationMeta.reason || 'Gemini 响应异常'}）`
          );
        } else {
          showToast('《个人知识背景分析报告》已生成！您现在可以进入第二步导入待译英文论文。');
        }
      } else {
        const errMsg = data.error || '生成《个人知识背景分析报告》时出现异常。';
        setReportError(errMsg);
        showToast(errMsg);
      }
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : '生成《个人知识背景分析报告》请求失败，请稍后重试。';
      setReportError(errMsg);
      showToast(errMsg);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDynamicFeedback = (
    conceptZh: string,
    conceptEn: string,
    action: 'mark_mastered' | 'mark_unfamiliar' | 'request_deep_derivation',
    userNote?: string
  ) => {
    const { updatedNodes, feedbackEvent } = applyDynamicKnowledgeFeedback(
      knowledgeNodes,
      conceptZh,
      conceptEn,
      action,
      userNote
    );
    setKnowledgeNodes(updatedNodes);
    setFeedbackHistory((prev) => [feedbackEvent, ...prev]);
    showToast(feedbackEvent.effectOnDocument);
  };

  const handleAppendAnnotationToParagraph = (
    paragraphId: string,
    newAnnotation: PrecisionAnnotation
  ) => {
    const safeNewAnn = normalizePrecisionAnnotation(newAnnotation, `ann-${paragraphId}-99`);
    setCurrentDocument((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: (prev.sections || []).map((sec) => ({
          ...sec,
          paragraphs: (sec.paragraphs || []).map((p) =>
            p.id === paragraphId
              ? {
                  ...p,
                  annotations: [...(p.annotations || []), safeNewAnn],
                }
              : p
          ),
        })),
      };
    });
    showToast(
      `已将 Gemini 伴读导师针对「${safeNewAnn.targetConceptZh}」的补充推导直接加入正文段落批注中！`
    );
  };

  const handlePreAnalysisGenerated = (preAnalysis: PaperPreAnalysis) => {
    setCurrentPreAnalysis(preAnalysis);
    setIsPreAnalysisConfirmed(false);
    showToast('论文预分析与逐章知识缺口诊断已完成！请核对预分析方案后点击确认开始全文深度翻译。');
  };

  const executeChunkedTranslation = async (resumeFromSnapshot: boolean = false) => {
    if (!currentPreAnalysis && !inProgressTranslation) return;
    setIsPreAnalysisConfirmed(true);
    setCurrentPreAnalysis((prev) => (prev ? { ...prev, confirmedByUser: true } : null));
    setTranslationError(null);

    const resolvedPaperId =
      (resumeFromSnapshot && inProgressTranslation?.paperId) ||
      currentPreAnalysis?.paperId ||
      currentDocument?.paperId ||
      `doc-${Date.now()}`;
    const resolvedTitleEn =
      (resumeFromSnapshot && inProgressTranslation?.titleEn) ||
      paperTitleEn.trim() ||
      currentPreAnalysis?.titleEn ||
      'Theoretical Physics Manuscript';
    const resolvedTitleZh =
      (resumeFromSnapshot && inProgressTranslation?.titleZh) ||
      currentPreAnalysis?.titleZh ||
      resolvedTitleEn;
    const resolvedAuthors =
      (resumeFromSnapshot && inProgressTranslation?.authors) ||
      paperAuthors.trim() ||
      currentPreAnalysis?.authors ||
      '';
    const resolvedArxivId =
      (resumeFromSnapshot && inProgressTranslation?.arxivIdOrDoi) ||
      paperArxivId.trim() ||
      currentPreAnalysis?.arxivIdOrDoi ||
      '';
    const sourceTextForChunking =
      paperRawText.trim() ||
      currentPreAnalysis?.coreInnovationSummary ||
      resolvedTitleEn;
    const rawTextHash = `${sourceTextForChunking.length}:${sourceTextForChunking.slice(0, 120)}`;

    const chunkBudget = getRecommendedChunkBudget(annotationDetailLevel);
    const chunks =
      resumeFromSnapshot &&
      inProgressTranslation &&
      inProgressTranslation.chunks.length > 0
        ? inProgressTranslation.chunks
        : splitPaperIntoSectionChunks(sourceTextForChunking, {
            maxChunkChars: chunkBudget.maxChunkChars,
            maxParagraphsPerChunk: chunkBudget.maxParagraphsPerChunk,
            fallbackTitleEn: resolvedTitleEn,
          });

    if (chunks.length === 0) {
      setTranslationError('未检测到可用于分节翻译的有效论文文本，请返回补充论文内容后重试。');
      return;
    }

    setIsTranslatingFull(true);
    const outcomes: ChunkTranslationOutcome[] =
      resumeFromSnapshot &&
      inProgressTranslation &&
      inProgressTranslation.outcomes.length === chunks.length
        ? inProgressTranslation.outcomes.map((o) => ({ ...o }))
        : chunks.map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            sectionNumber: chunk.sectionNumber,
            sectionTitleEn: chunk.sectionTitleEn,
            status: 'pending',
          }));

    const initialDoneCount = outcomes.filter(
      (o) => o.status === 'completed' || o.status === 'degraded' || o.status === 'failed'
    ).length;

    setTranslationProgress({
      currentChunk: initialDoneCount,
      totalChunks: chunks.length,
      currentSectionLabel:
        initialDoneCount < chunks.length
          ? `准备分节翻译：§${chunks[initialDoneCount].sectionNumber} ${chunks[initialDoneCount].sectionTitleEn}`
          : '全部章节处理完毕',
      chunks: [...outcomes],
    });

    try {
      for (let i = 0; i < chunks.length; i++) {
        // When resuming from a snapshot, skip chunks that already succeeded or were saved
        if (
          resumeFromSnapshot &&
          (outcomes[i]?.status === 'completed' || outcomes[i]?.status === 'degraded') &&
          outcomes[i]?.section
        ) {
          continue;
        }

        const chunk = chunks[i];
        outcomes[i] = {
          ...outcomes[i],
          status: 'running',
        };
        const currentDoneBefore = outcomes.filter(
          (o) => o.status === 'completed' || o.status === 'degraded' || o.status === 'failed'
        ).length;
        setTranslationProgress({
          currentChunk: currentDoneBefore,
          totalChunks: chunks.length,
          currentSectionLabel: `§${chunk.sectionNumber} ${chunk.sectionTitleEn}`,
          chunks: [...outcomes],
        });

        try {
          const resp = await fetch('/api/translate-chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              titleEn: resolvedTitleEn,
              titleZh: resolvedTitleZh,
              authors: resolvedAuthors,
              arxivIdOrDoi: resolvedArxivId,
              chunk,
              materials,
              knowledgeNodes,
              annotationDetailLevel,
            }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            const errMsg = data?.error || `第 ${i + 1} 节翻译请求失败 (HTTP ${resp.status})`;
            const failMeta = {
              degraded: true,
              sourceMode: 'deterministic_fallback' as const,
              errorCode: 'NETWORK_ERROR' as const,
              reason: errMsg,
              retryable: true,
            };
            outcomes[i] = {
              chunkIndex: chunk.chunkIndex,
              sectionNumber: chunk.sectionNumber,
              sectionTitleEn: chunk.sectionTitleEn,
              status: 'failed',
              section: buildFallbackSectionFromChunk(chunk, errMsg, failMeta),
              generationMeta: failMeta,
              errorMessage: errMsg,
            };
          } else {
            outcomes[i] = {
              chunkIndex: chunk.chunkIndex,
              sectionNumber: data.sectionNumber || chunk.sectionNumber,
              sectionTitleEn: data.sectionTitleEn || chunk.sectionTitleEn,
              status: data.status === 'completed' ? 'completed' : 'degraded',
              titleZh: data.titleZh,
              translatedAbstractZh: data.translatedAbstractZh,
              section: data.section,
              terminologyItems: Array.isArray(data.terminologyItems)
                ? data.terminologyItems
                : [],
              generationMeta: data.generationMeta,
              errorMessage: data.errorMessage,
            };
          }
        } catch (chunkErr) {
          const errMsg =
            chunkErr instanceof Error ? chunkErr.message : '单节翻译网络请求失败';
          const netMeta = {
            degraded: true,
            sourceMode: 'deterministic_fallback' as const,
            errorCode: 'NETWORK_ERROR' as const,
            reason: errMsg,
            retryable: true,
          };
          outcomes[i] = {
            chunkIndex: chunk.chunkIndex,
            sectionNumber: chunk.sectionNumber,
            sectionTitleEn: chunk.sectionTitleEn,
            status: 'failed',
            section: buildFallbackSectionFromChunk(chunk, errMsg, netMeta),
            generationMeta: netMeta,
            errorMessage: errMsg,
          };
        }

        const completedOutcomesSoFar = outcomes.filter((o) => Boolean(o.section));
        const doneCountNow = completedOutcomesSoFar.length;

        setTranslationProgress({
          currentChunk: doneCountNow,
          totalChunks: chunks.length,
          currentSectionLabel: `§${chunk.sectionNumber} ${chunk.sectionTitleEn}`,
          chunks: [...outcomes],
        });

        // Incremental Persistence: Immediately build & save partial document after every finished chunk
        if (completedOutcomesSoFar.length > 0) {
          const partialDoc = mergeTranslatedSectionChunks({
            baseMeta: {
              paperId: resolvedPaperId,
              titleZh: resolvedTitleZh,
              titleEn: resolvedTitleEn,
              authors: resolvedAuthors,
              institutionOrJournal: 'arXiv / Peer-Reviewed Preprint',
              arxivIdOrDoi: resolvedArxivId,
              abstractZh:
                currentPreAnalysis?.coreInnovationSummary ||
                currentDocument?.abstractZh ||
                '',
              groundingSources:
                currentPreAnalysis?.groundingSources ||
                currentDocument?.groundingSources ||
                [],
            },
            chunkOutcomes: completedOutcomesSoFar,
          });

          setCurrentDocument(partialDoc);
          const snapshotNow: InProgressTranslationSnapshot = {
            paperId: resolvedPaperId,
            titleEn: resolvedTitleEn,
            titleZh: partialDoc.titleZh || resolvedTitleZh,
            authors: resolvedAuthors,
            arxivIdOrDoi: resolvedArxivId,
            rawTextHash,
            annotationDetailLevel,
            chunks,
            outcomes: [...outcomes],
            updatedAt: new Date().toISOString(),
          };
          setInProgressTranslation(snapshotNow);

          setSavedPapersArchive((prevArchive) =>
            upsertArchivedPaper(prevArchive, {
              paperId: resolvedPaperId,
              titleZh: partialDoc.titleZh || resolvedTitleZh,
              titleEn: resolvedTitleEn,
              authors: resolvedAuthors,
              arxivIdOrDoi: resolvedArxivId,
              savedAt: new Date().toISOString(),
              annotationDetailLevel,
              completedChunks: doneCountNow,
              totalChunks: chunks.length,
              preAnalysis: currentPreAnalysis,
              document: partialDoc,
              paperRawText: sourceTextForChunking,
            })
          );
        }
      }

      const mergedDoc = mergeTranslatedSectionChunks({
        baseMeta: {
          paperId: resolvedPaperId,
          titleZh: resolvedTitleZh,
          titleEn: resolvedTitleEn,
          authors: resolvedAuthors,
          institutionOrJournal: 'arXiv / Peer-Reviewed Preprint',
          arxivIdOrDoi: resolvedArxivId,
          abstractZh:
            currentPreAnalysis?.coreInnovationSummary ||
            currentDocument?.abstractZh ||
            '',
          groundingSources:
            currentPreAnalysis?.groundingSources ||
            currentDocument?.groundingSources ||
            [],
        },
        chunkOutcomes: outcomes,
      });

      const activeProf = getAnnotationDetailProfile(annotationDetailLevel);
      setCurrentDocument(mergedDoc);
      setInProgressTranslation(null);
      setSavedPapersArchive((prevArchive) =>
        upsertArchivedPaper(prevArchive, {
          paperId: resolvedPaperId,
          titleZh: mergedDoc.titleZh,
          titleEn: resolvedTitleEn,
          authors: resolvedAuthors,
          arxivIdOrDoi: resolvedArxivId,
          savedAt: new Date().toISOString(),
          annotationDetailLevel,
          completedChunks: chunks.length,
          totalChunks: chunks.length,
          preAnalysis: currentPreAnalysis,
          document: mergedDoc,
          paperRawText: sourceTextForChunking,
        })
      );
      setActiveTab('translation');

      if (mergedDoc.generationMeta?.degraded) {
        showToast(
          `▲ 已完成分节处理并归档至「历史论文库」，部分章节已降级保留原文（${mergedDoc.generationMeta.reason || 'Gemini 服务降级'}），可在文稿页逐节重试。`
        );
      } else {
        showToast(
          `预分析方案已确认！已按「Lv.${activeProf.level} ${activeProf.shortLabel}」完成全 ${chunks.length} 节纯中文深度翻译与批注，并自动归档至「历史论文库」。`
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '全文分节深度翻译请求失败，请检查网络或论文内容后重试。';
      setTranslationError(msg);
      showToast(msg);
    } finally {
      setIsTranslatingFull(false);
    }
  };

  const handleConfirmAndTranslate = async () => {
    await executeChunkedTranslation(false);
  };

  const handleResumeIncompleteTranslation = async () => {
    await executeChunkedTranslation(true);
  };

  const handleSelectArchivedPaper = (entry: ArchivedPaperEntry) => {
    const normalizedDoc = normalizeTranslatedPaperDocument(entry.document);
    if (!normalizedDoc) return;
    setPaperTitleEn(entry.titleEn);
    setPaperAuthors(entry.authors);
    setPaperArxivId(entry.arxivIdOrDoi);
    if (entry.paperRawText) {
      setPaperRawText(entry.paperRawText);
    }
    if (entry.preAnalysis) {
      setCurrentPreAnalysis(entry.preAnalysis);
      setIsPreAnalysisConfirmed(true);
    }
    setCurrentDocument(normalizedDoc);
    setActiveTab('translation');
    showToast(`已从历史论文库加载《${entry.titleZh}》（已译 ${entry.completedChunks}/${entry.totalChunks} 节）。`);
  };

  const handleDeleteArchivedPaper = (paperId: string) => {
    const target = savedPapersArchive.find((p) => p.paperId === paperId);
    setSavedPapersArchive((prev) => removeArchivedPaper(prev, paperId));
    if (target) {
      showToast(`已从历史论文库中移除《${target.titleZh}》。`);
    }
  };

  const handleExportArchivedPaperMarkdown = (entry: ArchivedPaperEntry) => {
    const md = exportAcademicMarkdown(
      entry.document,
      knowledgeNodes,
      report,
      entry.preAnalysis,
      false
    );
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entry.titleZh || '理论物理论文中文批注文稿'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`已导出《${entry.titleZh}》的 Markdown + LaTeX 学术批注文稿。`);
  };

  const handleRetryDegradedSections = async (chunkIndices?: number[]) => {
    if (!currentDocument) return;

    const targetIndices =
      chunkIndices && chunkIndices.length > 0
        ? Array.from(new Set(chunkIndices))
        : currentDocument.sections
            .map((sec, idx) => (sec.generationMeta?.degraded ? sec.chunkIndex ?? idx : -1))
            .filter((idx) => idx >= 0);

    if (targetIndices.length === 0) return;

    const sourceTextForChunking =
      paperRawText.trim() ||
      currentPreAnalysis?.coreInnovationSummary ||
      currentDocument.titleEn;
    const chunkBudget = getRecommendedChunkBudget(annotationDetailLevel);
    const derivedChunks = splitPaperIntoSectionChunks(sourceTextForChunking, {
      maxChunkChars: chunkBudget.maxChunkChars,
      maxParagraphsPerChunk: chunkBudget.maxParagraphsPerChunk,
      fallbackTitleEn: currentDocument.titleEn,
    });

    setRetryingChunkIndices(targetIndices);

    try {
      const updatedOutcomes: ChunkTranslationOutcome[] = currentDocument.sections.map(
        (sec, idx) => ({
          chunkIndex: sec.chunkIndex ?? idx,
          sectionNumber: sec.sectionNumber,
          sectionTitleEn: sec.titleEn,
          status: sec.generationMeta?.degraded ? 'degraded' : 'completed',
          section: sec,
          terminologyItems: [],
          generationMeta: sec.generationMeta,
        })
      );

      for (const targetIdx of targetIndices) {
        const existingIdx = updatedOutcomes.findIndex((o) => o.chunkIndex === targetIdx);
        const existingSection =
          existingIdx >= 0 ? updatedOutcomes[existingIdx].section : currentDocument.sections[targetIdx];

        const chunk: PaperSectionChunk = derivedChunks[targetIdx] || {
          chunkIndex: targetIdx,
          totalChunks: Math.max(currentDocument.sections.length, targetIdx + 1),
          sectionNumber: existingSection?.sectionNumber || String(targetIdx + 1),
          sectionTitleEn: existingSection?.titleEn || `Section ${targetIdx + 1}`,
          rawChunkText:
            existingSection?.paragraphs.map((p) => p.originalEnExcerpt).join('\n\n') ||
            currentDocument.abstractZh,
          paragraphCount: existingSection?.paragraphs.length || 1,
          charCount:
            existingSection?.paragraphs.map((p) => p.originalEnExcerpt).join('\n\n').length ||
            100,
        };

        try {
          const resp = await fetch('/api/translate-chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              titleEn: currentDocument.titleEn,
              titleZh: currentDocument.titleZh,
              authors: currentDocument.authors,
              arxivIdOrDoi: currentDocument.arxivIdOrDoi,
              chunk,
              materials,
              knowledgeNodes,
              annotationDetailLevel,
            }),
          });
          const data = await resp.json();
          if (resp.ok && data.section && existingIdx >= 0) {
            updatedOutcomes[existingIdx] = {
              chunkIndex: chunk.chunkIndex,
              sectionNumber: data.sectionNumber || chunk.sectionNumber,
              sectionTitleEn: data.sectionTitleEn || chunk.sectionTitleEn,
              status: data.status === 'completed' ? 'completed' : 'degraded',
              titleZh: data.titleZh,
              translatedAbstractZh: data.translatedAbstractZh,
              section: data.section,
              terminologyItems: Array.isArray(data.terminologyItems)
                ? data.terminologyItems
                : [],
              generationMeta: data.generationMeta,
              errorMessage: data.errorMessage,
            };
          } else if (existingIdx >= 0) {
            const errMsg = data?.error || `重试第 ${targetIdx + 1} 节翻译失败`;
            const failMeta = {
              degraded: true,
              sourceMode: 'deterministic_fallback' as const,
              errorCode: 'NETWORK_ERROR' as const,
              reason: errMsg,
              retryable: true,
            };
            updatedOutcomes[existingIdx] = {
              ...updatedOutcomes[existingIdx],
              status: 'failed',
              section: buildFallbackSectionFromChunk(chunk, errMsg, failMeta),
              generationMeta: failMeta,
              errorMessage: errMsg,
            };
          }
        } catch (err) {
          if (existingIdx >= 0) {
            const errMsg = err instanceof Error ? err.message : '重试单节翻译网络异常';
            const netMeta = {
              degraded: true,
              sourceMode: 'deterministic_fallback' as const,
              errorCode: 'NETWORK_ERROR' as const,
              reason: errMsg,
              retryable: true,
            };
            updatedOutcomes[existingIdx] = {
              ...updatedOutcomes[existingIdx],
              status: 'failed',
              section: buildFallbackSectionFromChunk(chunk, errMsg, netMeta),
              generationMeta: netMeta,
              errorMessage: errMsg,
            };
          }
        }
      }

      const rebuiltDoc = mergeTranslatedSectionChunks({
        baseMeta: {
          paperId: currentDocument.paperId,
          titleZh: currentDocument.titleZh,
          titleEn: currentDocument.titleEn,
          authors: currentDocument.authors,
          institutionOrJournal: currentDocument.institutionOrJournal,
          arxivIdOrDoi: currentDocument.arxivIdOrDoi,
          abstractZh: currentDocument.abstractZh,
          groundingSources: currentDocument.groundingSources,
        },
        chunkOutcomes: updatedOutcomes,
      });

      // Preserve previously extracted terminology entries alongside any newly recovered terms
      const mergedTermMap = new Map(
        currentDocument.terminologyTable.map((t) => [
          `${(t.termEn || '').trim().toLowerCase()}::${(t.termZh || '').trim()}`,
          t,
        ])
      );
      for (const term of rebuiltDoc.terminologyTable) {
        const key = `${(term.termEn || '').trim().toLowerCase()}::${(term.termZh || '').trim()}`;
        if (key !== '::' && !mergedTermMap.has(key)) {
          mergedTermMap.set(key, term);
        }
      }

      const finalDoc: TranslatedPaperDocument = {
        ...rebuiltDoc,
        terminologyTable: Array.from(mergedTermMap.values()),
      };
      setCurrentDocument(finalDoc);

      if (finalDoc.generationMeta?.degraded) {
        showToast(
          `▲ 已完成重试，当前仍有 ${
            (finalDoc.chunkStatusSummary?.degradedChunks || 0) +
            (finalDoc.chunkStatusSummary?.failedChunks || 0)
          } 节处于降级状态。`
        );
      } else {
        showToast('● 已成功重试恢复全部降级章节的 Gemini 深度翻译与批注！');
      }
    } finally {
      setRetryingChunkIndices([]);
    }
  };

  const exportedMarkdownText = React.useMemo(
    () =>
      exportAcademicMarkdown(
        currentDocument,
        knowledgeNodes,
        report,
        currentPreAnalysis,
        false
      ),
    [currentDocument, knowledgeNodes, report, currentPreAnalysis]
  );

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(exportedMarkdownText);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2500);
  };

  const handleDownloadMarkdownFile = () => {
    const blob = new Blob([exportedMarkdownText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDocument?.titleZh || currentPreAnalysis?.titleZh || '理论物理论文中文批注文稿'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ErrorBoundary
      fallbackTitle="PhysicaAnnotate 工作台捕获到意外渲染异常"
      onAutoRepairAndReset={handleAutoRepairWorkspaceState}
      onExportBackup={handleDownloadMarkdownFile}
    >
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
        {/* Strict 3-Zone Top Navigation Bar Contract — Responsive across 375px / 768px / 1440px */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-3">
          <div className="max-w-[1380px] mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-4 lg:gap-6">
            {/* Zone 1: Single text element wordmark */}
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('knowledge');
              }}
              className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              PhysicaAnnotate
            </a>

            {/* Zone 2: 4 concise single-line text navigation links */}
            <nav
              aria-label="主工作流导航"
              className="order-3 w-full pt-1.5 border-t border-slate-100 md:order-none md:w-auto md:pt-0 md:border-t-0 flex items-center justify-between sm:justify-start gap-2 sm:gap-4 lg:gap-6 text-xs sm:text-sm font-medium text-slate-600 overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => setActiveTab('knowledge')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'knowledge'
                    ? 'text-blue-600 font-semibold underline underline-offset-4 sm:underline-offset-8 decoration-2'
                    : 'hover:text-slate-900'
                }`}
              >
                <span className="xl:hidden">1. 知识建模</span>
                <span className="hidden xl:inline">1. 知识背景建模</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pre_analysis')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'pre_analysis'
                    ? 'text-blue-600 font-semibold underline underline-offset-4 sm:underline-offset-8 decoration-2'
                    : 'hover:text-slate-900'
                }`}
              >
                <span className="xl:hidden">2. 预分析</span>
                <span className="hidden xl:inline">2. 论文预分析与缺口</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('translation')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'translation'
                    ? 'text-blue-600 font-semibold underline underline-offset-4 sm:underline-offset-8 decoration-2'
                    : 'hover:text-slate-900'
                }`}
              >
                <span className="xl:hidden">3. 批注文稿</span>
                <span className="hidden xl:inline">3. 深度翻译与批注文稿</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('verification')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'verification'
                    ? 'text-blue-600 font-semibold underline underline-offset-4 sm:underline-offset-8 decoration-2'
                    : 'hover:text-slate-900'
                }`}
              >
                <span className="xl:hidden">4. 术语核验</span>
                <span className="hidden xl:inline">4. 术语与文献核验</span>
              </button>
            </nav>

            {/* Zone 3: History Archive, Settings & Primary Export Action */}
            <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(true)}
                aria-label={`打开历史精读论文库（已归档 ${savedPapersArchive.length} 篇）`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">历史论文</span>
                <span className="font-mono-tabular text-[11px] text-slate-600">
                  ({savedPapersArchive.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                aria-label={`打开全局设置（当前批注详细程度 Lv.${annotationDetailLevel}）`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                <span>设置</span>
                <span className="hidden lg:inline font-mono-tabular text-[11px] text-slate-500">
                  Lv.{annotationDetailLevel}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                className="px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="sm:hidden">导出文稿</span>
                <span className="hidden sm:inline">导出中文学术文稿</span>
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Feedback Notification Bar */}
        {toastBanner && (
          <div
            role="status"
            className="bg-slate-900 text-white px-6 py-2.5 text-xs border-b border-slate-800"
          >
            <div className="max-w-[1380px] mx-auto flex items-center justify-between gap-4">
              <span>{toastBanner}</span>
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                aria-label="关闭通知"
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Container */}
        <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {activeTab === 'knowledge' && (
            <ErrorBoundary
              fallbackTitle="知识背景建模视图遇到数据格式异常"
              onAutoRepairAndReset={handleAutoRepairWorkspaceState}
              onExportBackup={handleDownloadMarkdownFile}
            >
              <KnowledgeStageView
                materials={materials}
                knowledgeNodes={knowledgeNodes}
                report={report}
                isGeneratingReport={isGeneratingReport}
                reportError={reportError}
                onAddMaterial={handleAddMaterial}
                onUpdateMaterialBreakdown={handleUpdateMaterialBreakdown}
                onRemoveMaterial={handleRemoveMaterial}
                onAddCustomNode={handleAddCustomNode}
                onRemoveNode={handleRemoveNode}
                onUpdateNodeLevel={handleUpdateNodeLevel}
                onGenerateReport={handleGenerateReport}
                onProceedToPreAnalysis={() => setActiveTab('pre_analysis')}
                onClearAllWorkspace={handleClearAllWorkspace}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'pre_analysis' && (
            <ErrorBoundary
              fallbackTitle="论文预分析视图遇到数据格式异常"
              onAutoRepairAndReset={handleAutoRepairWorkspaceState}
              onExportBackup={handleDownloadMarkdownFile}
            >
              <Suspense
                fallback={
                  <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-xs font-mono-tabular text-slate-500">
                    正在加载论文预分析与缺口评估工作台...
                  </div>
                }
              >
                <PreAnalysisStageView
                  materials={materials}
                  knowledgeNodes={knowledgeNodes}
                  currentPreAnalysis={currentPreAnalysis}
                  paperTitleEn={paperTitleEn}
                  paperAuthors={paperAuthors}
                  paperArxivId={paperArxivId}
                  paperRawText={paperRawText}
                  onChangePaperTitle={setPaperTitleEn}
                  onChangePaperAuthors={setPaperAuthors}
                  onChangePaperArxivId={setPaperArxivId}
                  onChangePaperRawText={setPaperRawText}
                  isPreAnalysisConfirmed={isPreAnalysisConfirmed}
                  isTranslatingFull={isTranslatingFull}
                  translationProgress={translationProgress}
                  translationError={translationError}
                  onPreAnalysisGenerated={handlePreAnalysisGenerated}
                  onConfirmAndTranslate={handleConfirmAndTranslate}
                  onBackToKnowledgeStage={() => setActiveTab('knowledge')}
                  annotationDetailLevel={annotationDetailLevel}
                  onOpenSettings={() => setSettingsModalOpen(true)}
                  inProgressTranslation={inProgressTranslation}
                  onResumeIncompleteTranslation={handleResumeIncompleteTranslation}
                  hasPartialTranslatedDocument={Boolean(currentDocument)}
                  onSwitchToTranslationTab={() => setActiveTab('translation')}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {activeTab === 'translation' && (
            <ErrorBoundary
              fallbackTitle="深度翻译与批注文稿视图捕获到非标准模型字段"
              onAutoRepairAndReset={handleAutoRepairWorkspaceState}
              onExportBackup={handleDownloadMarkdownFile}
            >
              <div className="space-y-6">
                {!currentDocument ? (
                  <section className="bg-white border border-slate-200 rounded-lg p-10 text-center max-w-2xl mx-auto space-y-5 my-8">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-mono-tabular text-blue-600 font-semibold">
                        工作流门控：未经预分析确认，不直接开始全文翻译
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">
                        尚未生成中文深度翻译与精准批注文稿
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        根据您的工作流规范，请先在「1. 知识背景建模」中录入您读过的教材/论文，随后在「2. 论文预分析与缺口」中导入待译英文论文并点击确认预分析方案。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('knowledge')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>前往 1. 知识背景建模</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('pre_analysis')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
                      >
                        <span>前往 2. 导入论文并执行预分析</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      {savedPapersArchive.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setHistoryModalOpen(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>从历史论文库加载 ({savedPapersArchive.length})</span>
                        </button>
                      )}
                    </div>
                  </section>
                ) : (
                  <Suspense
                    fallback={
                      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-xs font-mono-tabular text-slate-500">
                        正在加载双栏深度翻译与精准批注文稿视图...
                      </div>
                    }
                  >
                    <TranslationDocumentView
                      document={currentDocument}
                      knowledgeNodes={knowledgeNodes}
                      materials={materials}
                      persistedChatTurns={paperChatHistory[currentDocument.paperId]}
                      onChatTurnsChange={(paperId, turns) =>
                        setPaperChatHistory((prev) => upsertPaperChatTurns(prev, paperId, turns))
                      }
                      persistedActiveParagraphId={activeParagraphByPaperId[currentDocument.paperId]}
                      onActiveParagraphChange={(paperId, paragraphId) =>
                        setActiveParagraphByPaperId((prev) =>
                          prev[paperId] === paragraphId ? prev : { ...prev, [paperId]: paragraphId }
                        )
                      }
                      persistedMindMaps={derivationMindMapsByPaperId[currentDocument.paperId]}
                      onMindMapsChange={(paperId, maps) =>
                        setDerivationMindMapsByPaperId((prev) => ({ ...prev, [paperId]: maps }))
                      }
                      onDynamicFeedback={handleDynamicFeedback}
                      onAppendAnnotation={handleAppendAnnotationToParagraph}
                      onExportDocument={() => setExportModalOpen(true)}
                      annotationDetailLevel={annotationDetailLevel}
                      manuscriptWidthPercent={manuscriptWidthPercent}
                      onManuscriptWidthPercentChange={setManuscriptWidthPercent}
                      onOpenSettings={() => setSettingsModalOpen(true)}
                      onRetryDegradedSections={handleRetryDegradedSections}
                      retryingChunkIndices={retryingChunkIndices}
                      isTranslatingFull={isTranslatingFull}
                      inProgressTranslation={inProgressTranslation}
                      onResumeIncompleteTranslation={handleResumeIncompleteTranslation}
                    />
                  </Suspense>
                )}
              </div>
            </ErrorBoundary>
          )}

          {activeTab === 'verification' && (
            <ErrorBoundary
              fallbackTitle="术语与文献核验视图遇到数据格式异常"
              onAutoRepairAndReset={handleAutoRepairWorkspaceState}
              onExportBackup={handleDownloadMarkdownFile}
            >
              <div>
                {!currentDocument ? (
                  <section className="bg-white border border-slate-200 rounded-lg p-10 text-center max-w-2xl mx-auto space-y-5 my-8">
                    <div className="space-y-2">
                      <div className="text-xs font-mono-tabular text-slate-500">
                        第七阶段 · 专业术语统一对照表与联网文献核验
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">
                        完成论文翻译后即可查看术语统一表与文献核验清单
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        当您完成论文预分析确认并生成中文深度批注文稿后，此处将自动汇总全文「中文术语（English Term）」首次出现位置、K1–K4 动态反馈审计日志及 arXiv / CrossRef 文献核验状态。
                      </p>
                    </div>
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('pre_analysis')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
                      >
                        <span>前往导入待译论文</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </section>
                ) : (
                  <Suspense
                    fallback={
                      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-xs font-mono-tabular text-slate-500">
                        正在加载专业术语统一表与联网文献核验视图...
                      </div>
                    }
                  >
                    <TerminologyAndVerificationView
                      document={currentDocument}
                      feedbackHistory={feedbackHistory}
                      knowledgeNodes={knowledgeNodes}
                    />
                  </Suspense>
                )}
              </div>
            </ErrorBoundary>
          )}
        </main>

      {/* Quiet Academic Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 px-6 mt-12">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            PhysicaAnnotate · 基于个人知识背景（K1–K4 分级）的理论物理英文论文深度翻译与精准批注系统
          </div>
          <div className="flex items-center gap-4">
            <span>八阶段标准科研精读工作流</span>
            <span>·</span>
            <span>arXiv / ar5iv / CrossRef / OpenLibrary 实时联网检索</span>
          </div>
        </div>
      </footer>

      {/* Academic Markdown / LaTeX Document Export Dialog */}
      {exportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[85vh] flex flex-col shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 id="export-modal-title" className="text-base font-bold text-slate-900">
                  导出纯中文学术翻译与精准批注文稿 (Markdown + LaTeX)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  自动剔除您已掌握的 K1 基础知识冗余批注，保留全部公式编号、五类深度批注与术语对照表。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                aria-label="关闭导出窗口"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto bg-slate-50">
              <pre className="text-xs font-mono-tabular text-slate-800 whitespace-pre-wrap leading-relaxed bg-white p-4 border border-slate-200 rounded-md">
                {exportedMarkdownText}
              </pre>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-white">
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
              >
                {copiedMarkdown ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>已复制全文 Markdown</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制 Markdown 源码</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadMarkdownFile}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载 .md 学术批注文稿</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        annotationDetailLevel={annotationDetailLevel}
        onChangeAnnotationDetailLevel={(nextLevel) => {
          setAnnotationDetailLevel(nextLevel);
        }}
        onClose={() => setSettingsModalOpen(false)}
        hasActivePaperForRegen={Boolean(currentPreAnalysis && paperRawText.trim())}
        isTranslatingFull={isTranslatingFull}
        onRegenerateWithNewLevel={handleConfirmAndTranslate}
      />

      {/* Multi-Paper History Archive Modal */}
      {historyModalOpen && (
        <Suspense fallback={null}>
          <PaperHistoryModal
            isOpen={historyModalOpen}
            onClose={() => setHistoryModalOpen(false)}
            archivedPapers={savedPapersArchive}
            activePaperId={currentDocument?.paperId}
            inProgressTranslation={inProgressTranslation}
            onSelectPaper={handleSelectArchivedPaper}
            onDeletePaper={handleDeleteArchivedPaper}
            onExportPaperMarkdown={handleExportArchivedPaperMarkdown}
            onResumeInProgressTranslation={handleResumeIncompleteTranslation}
          />
        </Suspense>
      )}
      </div>
    </ErrorBoundary>
  );
}

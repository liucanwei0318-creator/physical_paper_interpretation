import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  TranslatedPaperDocument,
  KnowledgeNode,
  ReadingMaterial,
  PrecisionAnnotation,
  AnnotationType,
  TranslatedParagraph,
  PaperChatTurn,
  DerivationMindMapTree,
  AnnotationDetailLevel,
  InProgressTranslationSnapshot,
} from '../types/physics';
import { shouldDisplayAnnotation } from '../utils/knowledgeEngine';
import {
  getAnnotationDetailProfile,
  DEFAULT_MANUSCRIPT_WIDTH_PERCENT,
  MIN_MANUSCRIPT_WIDTH_PERCENT,
  MAX_MANUSCRIPT_WIDTH_PERCENT,
  clampManuscriptWidthPercent,
  computeManuscriptWidthPercentFromPointer,
} from '../utils/annotationSettings';
import {
  createWelcomeChatTurn,
  getChatTurnsForPaper,
  filterChatTurnsByParagraph,
  countUserQuestionsByParagraph,
  splitAcademicParagraphIntoSentences,
} from '../utils/workspacePersistence';
import {
  paragraphHasComplexFormula,
  buildDeterministicDerivationMindMap,
} from '../utils/derivationMindMap';
import { LatexBlock, MixedAcademicText } from './LatexRenderer';
import { DerivationMindMap } from './DerivationMindMap';
import { DiagnosticAlert } from './DiagnosticAlert';
import {
  CheckCircle2,
  BookOpen,
  Eye,
  EyeOff,
  Send,
  RefreshCw,
  Download,
  MessageSquare,
  MapPin,
  Sparkles,
  PlusCircle,
  X,
  History,
  Trash2,
  GitBranch,
  SlidersHorizontal,
  GripVertical,
} from 'lucide-react';

const MANUSCRIPT_WIDTH_CLASSES: Record<number, string> = {
  36: 'lg:w-[36%]',
  37: 'lg:w-[37%]',
  38: 'lg:w-[38%]',
  39: 'lg:w-[39%]',
  40: 'lg:w-[40%]',
  41: 'lg:w-[41%]',
  42: 'lg:w-[42%]',
  43: 'lg:w-[43%]',
  44: 'lg:w-[44%]',
  45: 'lg:w-[45%]',
  46: 'lg:w-[46%]',
  47: 'lg:w-[47%]',
  48: 'lg:w-[48%]',
  49: 'lg:w-[49%]',
  50: 'lg:w-[50%]',
  51: 'lg:w-[51%]',
  52: 'lg:w-[52%]',
  53: 'lg:w-[53%]',
  54: 'lg:w-[54%]',
  55: 'lg:w-[55%]',
  56: 'lg:w-[56%]',
  57: 'lg:w-[57%]',
  58: 'lg:w-[58%]',
  59: 'lg:w-[59%]',
  60: 'lg:w-[60%]',
  61: 'lg:w-[61%]',
  62: 'lg:w-[62%]',
  63: 'lg:w-[63%]',
  64: 'lg:w-[64%]',
  65: 'lg:w-[65%]',
  66: 'lg:w-[66%]',
  67: 'lg:w-[67%]',
  68: 'lg:w-[68%]',
  69: 'lg:w-[69%]',
  70: 'lg:w-[70%]',
  71: 'lg:w-[71%]',
  72: 'lg:w-[72%]',
  73: 'lg:w-[73%]',
  74: 'lg:w-[74%]',
  75: 'lg:w-[75%]',
  76: 'lg:w-[76%]',
};

interface TranslationDocumentViewProps {
  document: TranslatedPaperDocument;
  knowledgeNodes: KnowledgeNode[];
  materials?: ReadingMaterial[];
  persistedChatTurns?: PaperChatTurn[];
  onChatTurnsChange?: (paperId: string, turns: PaperChatTurn[]) => void;
  persistedActiveParagraphId?: string;
  onActiveParagraphChange?: (paperId: string, paragraphId: string) => void;
  persistedMindMaps?: Record<string, DerivationMindMapTree>;
  onMindMapsChange?: (paperId: string, mindMaps: Record<string, DerivationMindMapTree>) => void;
  onDynamicFeedback: (
    conceptZh: string,
    conceptEn: string,
    action: 'mark_mastered' | 'mark_unfamiliar' | 'request_deep_derivation',
    userNote?: string
  ) => void;
  onAppendAnnotation?: (paragraphId: string, newAnnotation: PrecisionAnnotation) => void;
  onExportDocument: () => void;
  annotationDetailLevel?: AnnotationDetailLevel;
  manuscriptWidthPercent?: number;
  onManuscriptWidthPercentChange?: (nextPercent: number) => void;
  onOpenSettings?: () => void;
  onRetryDegradedSections?: (chunkIndices?: number[]) => Promise<void>;
  retryingChunkIndices?: number[];
  isTranslatingFull?: boolean;
  inProgressTranslation?: InProgressTranslationSnapshot | null;
  onResumeIncompleteTranslation?: () => void;
}

interface FlattenedParagraphLocation {
  sectionNumber: string;
  sectionTitleZh: string;
  sectionTitleEn: string;
  paragraph: TranslatedParagraph;
}

export const TranslationDocumentView: React.FC<TranslationDocumentViewProps> = ({
  document: paperDoc,
  knowledgeNodes,
  materials = [],
  persistedChatTurns,
  onChatTurnsChange,
  persistedActiveParagraphId,
  onActiveParagraphChange,
  persistedMindMaps,
  onMindMapsChange,
  onDynamicFeedback,
  onAppendAnnotation,
  onExportDocument,
  annotationDetailLevel = 3,
  manuscriptWidthPercent = DEFAULT_MANUSCRIPT_WIDTH_PERCENT,
  onManuscriptWidthPercentChange,
  onOpenSettings,
  onRetryDegradedSections,
  retryingChunkIndices = [],
  isTranslatingFull = false,
  inProgressTranslation = null,
  onResumeIncompleteTranslation,
}) => {
  const detailProfile = getAnnotationDetailProfile(annotationDetailLevel);
  const [showSuppressedK1, setShowSuppressedK1] = useState(false);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<'ALL' | AnnotationType>('ALL');
  const [showOriginalPopoverId, setShowOriginalPopoverId] = useState<string | null>(null);

  // Draggable split-pane width ratio state (left manuscript % vs right AI companion %)
  const [leftPanePercent, setLeftPanePercent] = useState<number>(() =>
    clampManuscriptWidthPercent(manuscriptWidthPercent)
  );
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLeftPanePercent(clampManuscriptWidthPercent(manuscriptWidthPercent));
  }, [manuscriptWidthPercent]);

  const updateManuscriptWidth = useCallback(
    (nextRaw: number) => {
      const clamped = clampManuscriptWidthPercent(nextRaw);
      setLeftPanePercent(clamped);
      onManuscriptWidthPercentChange?.(clamped);
    },
    [onManuscriptWidthPercentChange]
  );

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handlePointerMove = (clientX: number) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nextPercent = computeManuscriptWidthPercentFromPointer(
        clientX,
        rect.left,
        rect.width
      );
      updateManuscriptWidth(nextPercent);
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handlePointerMove(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
      }
    };

    const handleDragEnd = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDraggingSplit, updateManuscriptWidth]);

  const paragraphRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Flatten paragraphs across sections so the Gemini chatbot can index and track every paragraph & equation
  const flatLocations = useMemo(() => {
    const list: FlattenedParagraphLocation[] = [];
    for (const sec of paperDoc.sections || []) {
      for (const para of sec.paragraphs || []) {
        list.push({
          sectionNumber: sec.sectionNumber || '1',
          sectionTitleZh: sec.titleZh || '本节正文',
          sectionTitleEn: sec.titleEn || 'Section',
          paragraph: para,
        });
      }
    }
    return list;
  }, [paperDoc]);

  // Active reading location state (synchronously shared with Gemini Chatbot)
  const [activeParagraphId, setActiveParagraphId] = useState<string>(() => {
    if (
      persistedActiveParagraphId &&
      flatLocations.some((l) => l.paragraph.id === persistedActiveParagraphId)
    ) {
      return persistedActiveParagraphId;
    }
    return flatLocations[0]?.paragraph.id || 'p-1-1';
  });
  const [focusedAnnotation, setFocusedAnnotation] = useState<PrecisionAnnotation | null>(null);
  const [selectedTextSnippet, setSelectedTextSnippet] = useState<string>('');
  const [locationUpdateMode, setLocationUpdateMode] = useState<'scroll' | 'click' | 'selection'>('click');
  const [onlyCurrentParagraphChat, setOnlyCurrentParagraphChat] = useState<boolean>(false);
  const suppressInitialObserverRef = useRef<boolean>(Boolean(persistedActiveParagraphId));

  useEffect(() => {
    if (
      flatLocations.length > 0 &&
      !flatLocations.some((l) => l.paragraph.id === activeParagraphId)
    ) {
      setActiveParagraphId(flatLocations[0].paragraph.id);
    }
  }, [flatLocations, activeParagraphId]);

  useEffect(() => {
    if (activeParagraphId) {
      onActiveParagraphChange?.(paperDoc.paperId, activeParagraphId);
    }
  }, [paperDoc.paperId, activeParagraphId, onActiveParagraphChange]);

  useEffect(() => {
    if (!persistedActiveParagraphId) return;
    suppressInitialObserverRef.current = true;
    const timer = setTimeout(() => {
      suppressInitialObserverRef.current = false;
    }, 600);
    return () => clearTimeout(timer);
  }, [paperDoc.paperId, persistedActiveParagraphId]);

  const activeLocationObj = useMemo(() => {
    return (
      flatLocations.find((l) => l.paragraph.id === activeParagraphId) ||
      flatLocations[0] ||
      null
    );
  }, [flatLocations, activeParagraphId]);

  const activeLocationBadge = useMemo(() => {
    if (!activeLocationObj) return '§1.1 全文概览';
    const eqNums = activeLocationObj.paragraph.equations?.map((e) => `(${e.number})`).join(', ');
    return [
      `§${activeLocationObj.sectionNumber}.${activeLocationObj.paragraph.paragraphIndex}《${activeLocationObj.sectionTitleZh}》`,
      eqNums ? `公式 ${eqNums}` : null,
      focusedAnnotation ? `批注【${focusedAnnotation.targetConceptZh}】` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [activeLocationObj, focusedAnnotation]);

  // Automatic viewport scroll observer so Gemini always knows which paragraph the user is reading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressInitialObserverRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
            const pid = entry.target.getAttribute('data-paragraph-id');
            if (pid && !selectedTextSnippet) {
              setActiveParagraphId(pid);
              setLocationUpdateMode('scroll');
            }
          }
        }
      },
      { threshold: [0.5] }
    );

    const currentRefs = paragraphRefs.current;
    Object.values(currentRefs).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [flatLocations, selectedTextSnippet]);

  // Detect mouse text selection in the manuscript so Gemini immediately knows what sentence/formula the user highlighted
  const handleManuscriptMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;

    let node: Node | null = sel.anchorNode;
    while (node && node !== window.document.body) {
      if (node instanceof HTMLElement) {
        const pid = node.getAttribute('data-paragraph-id');
        if (pid) {
          setActiveParagraphId(pid);
          break;
        }
      }
      node = node.parentNode;
    }
    setSelectedTextSnippet(text.slice(0, 260));
    setLocationUpdateMode('selection');
  };

  // Multi-Turn Context-Aware Gemini Companion Chatbot State (hydrated from PersistedWorkspaceState)
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatTurns, setChatTurns] = useState<PaperChatTurn[]>(() =>
    persistedChatTurns && persistedChatTurns.length > 0
      ? persistedChatTurns
      : [createWelcomeChatTurn(paperDoc, flatLocations[0]?.paragraph.id)]
  );
  const chatTurnsRef = useRef<PaperChatTurn[]>(chatTurns);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatPanelRef = useRef<HTMLElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lastPaperIdRef = useRef<string>(paperDoc.paperId);

  // Mathematical Derivation Mind Map State (per paragraph, persisted per paper)
  const [mindMapsByParaId, setMindMapsByParaId] = useState<Record<string, DerivationMindMapTree>>(
    () => persistedMindMaps ?? {}
  );
  const mindMapsRef = useRef<Record<string, DerivationMindMapTree>>(mindMapsByParaId);
  const [openMindMapIds, setOpenMindMapIds] = useState<Set<string>>(
    () => new Set(Object.keys(persistedMindMaps ?? {}))
  );
  const [generatingMindMapParaId, setGeneratingMindMapParaId] = useState<string | null>(null);

  // Sync chat history and mind maps cleanly if user switches to a different translated paper
  useEffect(() => {
    if (lastPaperIdRef.current !== paperDoc.paperId) {
      lastPaperIdRef.current = paperDoc.paperId;
      const restored =
        persistedChatTurns && persistedChatTurns.length > 0
          ? persistedChatTurns
          : getChatTurnsForPaper(undefined, paperDoc);
      chatTurnsRef.current = restored;
      setChatTurns(restored);
      setOnlyCurrentParagraphChat(false);

      const restoredMaps = persistedMindMaps ?? {};
      mindMapsRef.current = restoredMaps;
      setMindMapsByParaId(restoredMaps);
      setOpenMindMapIds(new Set(Object.keys(restoredMaps)));
    }
  }, [paperDoc, persistedChatTurns, persistedMindMaps]);

  const commitChatTurns = useCallback(
    (updater: (prev: PaperChatTurn[]) => PaperChatTurn[]) => {
      const next = updater(chatTurnsRef.current);
      chatTurnsRef.current = next;
      setChatTurns(next);
      onChatTurnsChange?.(paperDoc.paperId, next);
    },
    [onChatTurnsChange, paperDoc.paperId]
  );

  const questionCountByParagraph = useMemo(
    () => countUserQuestionsByParagraph(chatTurns),
    [chatTurns]
  );

  const displayedChatTurns = useMemo(
    () => filterChatTurnsByParagraph(chatTurns, activeParagraphId, onlyCurrentParagraphChat),
    [chatTurns, activeParagraphId, onlyCurrentParagraphChat]
  );

  const totalUserQuestions = useMemo(
    () => chatTurns.filter((t) => t.role === 'user').length,
    [chatTurns]
  );

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [displayedChatTurns, isSendingChat]);

  // Count visible vs suppressed annotations safely
  let totalAnnotations = 0;
  let visibleAnnotations = 0;
  let suppressedK1Count = 0;

  for (const sec of paperDoc.sections || []) {
    for (const para of sec.paragraphs || []) {
      for (const ann of para.annotations || []) {
        if (!ann) continue;
        totalAnnotations++;
        const status = shouldDisplayAnnotation(ann, knowledgeNodes, showSuppressedK1);
        if (status.currentLevel === 'K1') {
          suppressedK1Count++;
        }
        if (status.visible) {
          visibleAnnotations++;
        }
      }
    }
  }

  const handleSelectParagraphContext = (
    paraId: string,
    ann: PrecisionAnnotation | null = null,
    promptPrefill?: string,
    scrollToParagraph: boolean = false,
    autoSend: boolean = false
  ) => {
    suppressInitialObserverRef.current = true;
    setTimeout(() => {
      suppressInitialObserverRef.current = false;
    }, 1500);
    setActiveParagraphId(paraId);
    setFocusedAnnotation(ann);
    setLocationUpdateMode('click');
    if (scrollToParagraph) {
      const el = paragraphRefs.current[paraId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (promptPrefill) {
      if (autoSend) {
        if (chatPanelRef.current && window.innerWidth < 1024) {
          chatPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        void handleSendChatMessage(promptPrefill, { paraId, ann });
      } else {
        setChatInput(promptPrefill);
        if (chatPanelRef.current && window.innerWidth < 1024) {
          chatPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 60);
      }
    }
  };

  const handleClearPaperChatHistory = () => {
    const fresh = [createWelcomeChatTurn(paperDoc, activeParagraphId)];
    chatTurnsRef.current = fresh;
    setChatTurns(fresh);
    setOnlyCurrentParagraphChat(false);
    onChatTurnsChange?.(paperDoc.paperId, fresh);
  };

  const handleSendChatMessage = async (
    customPrompt?: string,
    overrideContext?: { paraId?: string; ann?: PrecisionAnnotation | null; selectedSentence?: string }
  ) => {
    const messageToSend = (customPrompt ?? chatInput).trim();
    if (!messageToSend || isSendingChat) return;

    const targetParaId = overrideContext?.paraId || activeParagraphId;
    const targetAnn =
      overrideContext && 'ann' in overrideContext ? overrideContext.ann : focusedAnnotation;
    const effectiveSnippet =
      overrideContext && 'selectedSentence' in overrideContext
        ? overrideContext.selectedSentence
        : selectedTextSnippet;

    const currentLoc =
      flatLocations.find((l) => l.paragraph.id === targetParaId) ||
      activeLocationObj ||
      flatLocations[0];
    const currentParaId = currentLoc?.paragraph.id || 'p-1-1';
    const eqNums = currentLoc?.paragraph.equations?.map((e) => `(${e.number})`).join(', ');
    const currentBadge = currentLoc
      ? [
          `§${currentLoc.sectionNumber}.${currentLoc.paragraph.paragraphIndex}《${currentLoc.sectionTitleZh}》`,
          eqNums ? `公式 ${eqNums}` : null,
          targetAnn ? `批注【${targetAnn.targetConceptZh}】` : null,
          effectiveSnippet ? `句子「${effectiveSnippet.slice(0, 18)}...」` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : activeLocationBadge;

    // Ensure the user's new question is always visible even if "仅看当前段" was active on another paragraph
    if (onlyCurrentParagraphChat && activeParagraphId !== currentParaId) {
      setActiveParagraphId(currentParaId);
    }

    const previousHistory = chatTurnsRef.current
      .filter((t) => !t.id.startsWith('welcome-') && !t.id.startsWith('err-'))
      .slice(-8)
      .map((t) => ({
        role: t.role,
        content: t.content,
        locationLabel: t.locationLabel,
      }));

    const userTurn: PaperChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageToSend,
      locationLabel: currentBadge,
      paragraphId: currentParaId,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    };

    commitChatTurns((prev) => [...prev, userTurn]);
    if (!customPrompt) setChatInput('');
    setIsSendingChat(true);

    try {
      const resp = await fetch('/api/paper-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: messageToSend,
          chatHistory: previousHistory,
          activeLocation: currentLoc
            ? {
                sectionNumber: currentLoc.sectionNumber,
                sectionTitleZh: currentLoc.sectionTitleZh,
                sectionTitleEn: currentLoc.sectionTitleEn,
                paragraphId: currentLoc.paragraph.id,
                paragraphIndex: currentLoc.paragraph.paragraphIndex,
                statementType: currentLoc.paragraph.statementType,
                translatedZhText: currentLoc.paragraph.translatedZhText,
                originalEnExcerpt: currentLoc.paragraph.originalEnExcerpt,
                equations: currentLoc.paragraph.equations || [],
                focusedAnnotation: targetAnn
                  ? {
                      id: targetAnn.id,
                      type: targetAnn.type,
                      targetConceptZh: targetAnn.targetConceptZh,
                      targetConceptEn: targetAnn.targetConceptEn,
                      targetEquationOrClause: targetAnn.targetEquationOrClause,
                      whatItIs: targetAnn.whatItIs,
                      mathOrPhysicalMechanism: targetAnn.mathOrPhysicalMechanism,
                    }
                  : undefined,
                selectedTextSnippet: effectiveSnippet || undefined,
              }
            : undefined,
          documentContext: {
            titleZh: paperDoc.titleZh,
            titleEn: paperDoc.titleEn,
            authors: paperDoc.authors,
            abstractZh: paperDoc.abstractZh,
            allSectionTitles: (paperDoc.sections || []).map(
              (s) => `${s.sectionNumber} ${s.titleZh}`
            ),
          },
          knowledgeNodes,
          materials,
          annotationDetailLevel,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Gemini 伴读导师响应失败');
      }

      const assistantTurn: PaperChatTurn = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.replyMarkdown || '已完成针对该段落的推导分析。',
        locationLabel: data.recognizedLocationSummary || currentBadge,
        paragraphId: currentParaId,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        suggestedAnnotation: data.suggestedAnnotation,
        generationMeta: data.generationMeta,
        retryPrompt: messageToSend,
      };

      commitChatTurns((prev) => [...prev, assistantTurn]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '请稍后重试';
      const errorTurn: PaperChatTurn = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `抱歉，回答您在「${currentBadge}」的问题时遇到请求异常：${errMsg}`,
        locationLabel: currentBadge,
        paragraphId: currentParaId,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        generationMeta: {
          degraded: true,
          sourceMode: 'deterministic_fallback',
          errorCode: 'NETWORK_ERROR',
          reason: errMsg,
          retryable: true,
        },
        retryPrompt: messageToSend,
      };
      commitChatTurns((prev) => [...prev, errorTurn]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handlePinChatAnswerToManuscript = (turn: PaperChatTurn) => {
    if (!turn.suggestedAnnotation || !onAppendAnnotation) return;
    onAppendAnnotation(turn.paragraphId, turn.suggestedAnnotation);
    commitChatTurns((prev) =>
      prev.map((t) => (t.id === turn.id ? { ...t, pinnedToManuscript: true } : t))
    );
  };

  const handleSelectSentenceForInquiry = (
    paraId: string,
    sentence: string,
    autoAskMeaning: boolean = false
  ) => {
    suppressInitialObserverRef.current = true;
    setTimeout(() => {
      suppressInitialObserverRef.current = false;
    }, 1500);
    setActiveParagraphId(paraId);
    setFocusedAnnotation(null);
    setSelectedTextSnippet(sentence);
    setLocationUpdateMode('selection');

    if (autoAskMeaning) {
      if (chatPanelRef.current && window.innerWidth < 1024) {
        chatPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      void handleSendChatMessage(
        `请帮我详细解释这句话的意思：「${sentence}」，包括它的字面含义、背后的物理/数学实质，以及在当前段落论证中的作用。`,
        { paraId, ann: null, selectedSentence: sentence }
      );
    }
  };

  const handleGenerateMindMap = async (
    para: TranslatedParagraph,
    sectionNumber: string,
    sectionTitleZh: string,
    forceRegenerate: boolean = false
  ) => {
    const existingTree = mindMapsRef.current[para.id];
    if (existingTree && !forceRegenerate) {
      setOpenMindMapIds((prev) => {
        const next = new Set(prev);
        if (next.has(para.id)) next.delete(para.id);
        else next.add(para.id);
        return next;
      });
      return;
    }

    setGeneratingMindMapParaId(para.id);
    setOpenMindMapIds((prev) => new Set(prev).add(para.id));

    let generatedTree: DerivationMindMapTree | null = null;
    let fallbackReason = 'Gemini 实时推导导图生成失败，已显示基于原文公式构建的本地结构骨架。';
    try {
      const resp = await fetch('/api/derivation-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperTitleZh: paperDoc.titleZh,
          sectionNumber,
          sectionTitleZh,
          paragraph: para,
          knowledgeNodes,
          annotationDetailLevel,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.mindMap) {
        generatedTree = data.mindMap as DerivationMindMapTree;
      } else {
        fallbackReason = data?.error || fallbackReason;
      }
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : fallbackReason;
    }

    const finalTree: DerivationMindMapTree =
      generatedTree || {
        ...buildDeterministicDerivationMindMap(
          para,
          sectionNumber,
          sectionTitleZh,
          annotationDetailLevel
        ),
        generationMeta: {
          degraded: true,
          sourceMode: 'deterministic_fallback',
          errorCode: 'NETWORK_ERROR',
          reason: fallbackReason,
          retryable: true,
        },
      };

    const nextMaps = { ...mindMapsRef.current, [para.id]: finalTree };
    mindMapsRef.current = nextMaps;
    setMindMapsByParaId(nextMaps);
    onMindMapsChange?.(paperDoc.paperId, nextMaps);
    setGeneratingMindMapParaId(null);
  };

  return (
    <div className="space-y-6">
      {/* Document Control & Precision Filter Ribbon */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono-tabular text-slate-500">
              <span>纯中文学术批注文稿 · 严禁中英双栏割裂</span>
              <span aria-hidden="true"> · </span>
              <span>已启用 K1–K4 动态批注过滤</span>
              <span aria-hidden="true"> · </span>
              <span>
                当前显示深度批注 {visibleAnnotations} 条（已自动为您过滤 K1 基础批注 {suppressedK1Count} 条）
              </span>
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              精准批注阅读控制台（第六阶段排版规范 & 第五阶段动态知识调整）
            </h2>
          </div>

          <div className="flex flex-wrap items-center lg:justify-end gap-2.5">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="点击打开全局设置，滑动调节批注深度与公式推导详略程度"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>
                  批注详略：Lv.{detailProfile.level} {detailProfile.shortLabel}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSuppressedK1((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showSuppressedK1 ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>隐藏 K1 已掌握基础批注 ({suppressedK1Count})</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>临时查看被过滤的 K1 批注 ({suppressedK1Count})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onExportDocument}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出 Markdown / LaTeX 完整文稿</span>
            </button>
          </div>
        </div>

        {/* 5 Annotation Types Filter Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                { id: 'ALL', label: '全部五类精准批注' },
                { id: '理论解释', label: '【理论解释】' },
                { id: '数学推导', label: '【数学推导】' },
                { id: '物理机制', label: '【物理机制】' },
                { id: '前置知识', label: '【前置知识】' },
                { id: '关键辨析', label: '【关键辨析】' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedAnnotationType(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  selectedAnnotationType === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-mono-tabular text-slate-500">
              推导真实性标识：【原文推导】作者原式 · 【补充推导】AI 补齐中间步骤 · 【独立核验】条件与量纲检验
            </div>

            {/* Split-Pane Width Ratio Control Bar (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-700">
              <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-mono-tabular whitespace-nowrap">
                版面宽度：论文批注 <strong>{leftPanePercent}%</strong> · AI 导读{' '}
                <strong>{100 - leftPanePercent}%</strong>
              </span>
              <input
                type="range"
                aria-label="调整论文批注文稿与 AI 导读版面宽度比例"
                min={MIN_MANUSCRIPT_WIDTH_PERCENT}
                max={MAX_MANUSCRIPT_WIDTH_PERCENT}
                step={1}
                value={leftPanePercent}
                onChange={(e) => updateManuscriptWidth(Number(e.target.value))}
                className="w-24 accent-blue-600 cursor-pointer"
              />
              <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
                {(
                  [
                    { pct: 50, label: '50:50 对半' },
                    { pct: 58, label: '58:42 默认' },
                    { pct: 68, label: '68:32 宽文稿' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.pct}
                    type="button"
                    onClick={() => updateManuscriptWidth(preset.pct)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono-tabular transition-colors cursor-pointer ${
                      leftPanePercent === preset.pct
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-200/80'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Incremental Translation Live Reading / Breakpoint Resume Banner */}
      {inProgressTranslation &&
        (() => {
          const doneCount = inProgressTranslation.outcomes.filter(
            (o) =>
              o.status === 'completed' || o.status === 'degraded' || o.status === 'failed'
          ).length;
          const totalCount = inProgressTranslation.chunks.length;
          if (doneCount >= totalCount) return null;
          return (
            <div
              data-testid="incremental-translation-banner"
              className="p-4 bg-blue-50/90 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="font-semibold text-blue-950 flex items-center gap-2">
                  {isTranslatingFull ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                      <span>
                        正在后台边译边存（实时可读模式）：已完成 {doneCount} / {totalCount} 节，新译完的章节将自动追加至下方文稿
                      </span>
                    </>
                  ) : (
                    <>
                      <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        断点续译就绪：本篇论文已保存前 {doneCount} / {totalCount} 节，尚有{' '}
                        {totalCount - doneCount} 节待继续翻译
                      </span>
                    </>
                  )}
                </div>
                <progress
                  value={doneCount}
                  max={Math.max(1, totalCount)}
                  className="w-full sm:w-80 h-1.5 accent-blue-600 rounded overflow-hidden block"
                />
              </div>
              {!isTranslatingFull && onResumeIncompleteTranslation && (
                <button
                  type="button"
                  onClick={onResumeIncompleteTranslation}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>从第 {doneCount + 1} 节继续断点续译</span>
                </button>
              )}
            </div>
          );
        })()}

      {paperDoc.generationMeta?.degraded && (
        <DiagnosticAlert
          variant="degraded"
          title="本文档存在部分章节降级翻译或保留原文（Gemini 未全量完成）"
          message={
            paperDoc.chunkStatusSummary
              ? `${paperDoc.generationMeta.reason || '部分章节未能完成实时翻译'}（已完成 ${paperDoc.chunkStatusSummary.geminiChunks} / ${paperDoc.chunkStatusSummary.totalChunks} 节，降级 ${paperDoc.chunkStatusSummary.degradedChunks + paperDoc.chunkStatusSummary.failedChunks} 节）`
              : paperDoc.generationMeta.reason || '部分章节已降级保留真实英文原文，可点击右侧重试。'
          }
          meta={paperDoc.generationMeta}
          retryLabel="重试全部降级章节"
          isRetrying={retryingChunkIndices.length > 0}
          onRetry={onRetryDegradedSections ? () => onRetryDegradedSections() : undefined}
        />
      )}

      {/* Main Resizable Two-Column Reading & Companion Mentor Layout */}
      <div
        ref={splitContainerRef}
        data-testid="translation-split-container"
        data-manuscript-width={leftPanePercent}
        className={`flex flex-col lg:flex-row items-start gap-6 lg:gap-0 ${
          isDraggingSplit ? 'select-none cursor-col-resize' : ''
        }`}
      >
        {/* Left Column: Pure-Chinese Academic Paper Manuscript */}
        <article
          onMouseUp={handleManuscriptMouseUp}
          className={`w-full ${
            MANUSCRIPT_WIDTH_CLASSES[leftPanePercent] || 'lg:w-[58%]'
          } lg:shrink-0 bg-white border border-slate-200 rounded-lg p-6 sm:p-10 space-y-10`}
        >
          {/* Academic Paper Header */}
          <header className="space-y-4 pb-8 border-b border-slate-200 text-center">
            <div className="text-xs font-mono-tabular text-slate-500">
              {paperDoc.institutionOrJournal} · {paperDoc.arxivIdOrDoi}
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-[26px] font-bold font-academic-serif text-slate-900 leading-snug max-w-4xl mx-auto">
              <MixedAcademicText text={paperDoc.titleZh} />
            </h1>
            <div className="text-sm text-slate-600 font-medium">{paperDoc.authors}</div>
            <div className="text-xs text-slate-400 font-mono-tabular">
              Original Title: <MixedAcademicText text={paperDoc.titleEn} />
            </div>

            {/* Pure Chinese Abstract */}
            <div className="mt-6 pt-6 border-t border-slate-100 text-left max-w-3xl mx-auto space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                摘要 (Abstract)
              </div>
              <p className="text-sm font-academic-serif text-slate-800 leading-relaxed">
                <MixedAcademicText text={paperDoc.abstractZh} />
              </p>
            </div>
          </header>

          {/* Sections & Paragraphs with Tightly-Coupled Inline Precision Annotations */}
          <div className="space-y-12">
            {(paperDoc.sections || []).map((section, secIdx) => {
              const targetChunkIdx = section.chunkIndex ?? secIdx;
              const isSectionRetrying = retryingChunkIndices.includes(targetChunkIdx);
              return (
              <section key={`${section.sectionNumber}-${secIdx}`} className="space-y-6">
                <div className="pb-2 border-b border-slate-200 space-y-2">
                  <div>
                    <h2 className="text-xl font-bold font-academic-serif text-slate-900">
                      {section.sectionNumber} <MixedAcademicText text={section.titleZh} />
                    </h2>
                    <div className="text-xs font-mono-tabular text-slate-400 mt-0.5">
                      Section {section.sectionNumber}: <MixedAcademicText text={section.titleEn} />
                    </div>
                  </div>
                  {section.generationMeta?.degraded && (
                    <DiagnosticAlert
                      variant="degraded"
                      title={`§${section.sectionNumber} 当前保留原文对照（翻译已降级）`}
                      message={
                        section.generationMeta.reason ||
                        '本节未能完成实时 Gemini 翻译，已保留真实英文原文与公式。'
                      }
                      meta={section.generationMeta}
                      retryLabel="重试本节翻译"
                      isRetrying={isSectionRetrying}
                      onRetry={
                        onRetryDegradedSections
                          ? () => onRetryDegradedSections([targetChunkIdx])
                          : undefined
                      }
                    />
                  )}
                </div>

                <div className="space-y-8">
                  {(section.paragraphs || []).map((para) => {
                    const isOriginalShown = showOriginalPopoverId === para.id;
                    const isParaActive = activeParagraphId === para.id;
                    const hasComplexFormula = paragraphHasComplexFormula(para);
                    const generatedMindMap = mindMapsByParaId[para.id];
                    const isMindMapOpen = openMindMapIds.has(para.id) && Boolean(generatedMindMap);
                    const isGeneratingMindMap = generatingMindMapParaId === para.id;

                    return (
                      <div
                        key={para.id}
                        ref={(el) => {
                          paragraphRefs.current[para.id] = el;
                        }}
                        data-paragraph-id={para.id}
                        onClick={() => handleSelectParagraphContext(para.id, null)}
                        className={`p-4 rounded-lg border transition-colors space-y-4 cursor-pointer ${
                          isParaActive
                            ? 'bg-blue-50/20 border-blue-300'
                            : 'bg-white border-transparent hover:border-slate-200'
                        }`}
                      >
                        {/* Paragraph Metadata Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular text-slate-500">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                isParaActive
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              §{section.sectionNumber}.{para.paragraphIndex}
                            </span>
                            <span>逻辑属性：{para.statementType}</span>
                            {isParaActive && (
                              <span className="text-blue-700 font-semibold inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                <span>Gemini 正在感知此段</span>
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            {(questionCountByParagraph[para.id] || 0) > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectParagraphContext(para.id, null);
                                  setOnlyCurrentParagraphChat(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 font-medium cursor-pointer"
                              >
                                <History className="w-3 h-3" />
                                <span>
                                  已存伴读 {questionCountByParagraph[para.id]} 问
                                </span>
                              </button>
                            )}

                            {hasComplexFormula && (
                              <button
                                type="button"
                                disabled={isGeneratingMindMap}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateMindMap(
                                    para,
                                    section.sectionNumber,
                                    section.titleZh
                                  );
                                }}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                  isMindMapOpen
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {isGeneratingMindMap ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <GitBranch className="w-3 h-3" />
                                )}
                                <span>
                                  {isGeneratingMindMap
                                    ? '正在生成导图...'
                                    : isMindMapOpen
                                    ? '收起数学推导思维导图'
                                    : generatedMindMap
                                    ? '展开数学推导思维导图'
                                    : '数学推导思维导图'}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowOriginalPopoverId(isOriginalShown ? null : para.id);
                              }}
                              className="text-slate-500 hover:text-slate-900 underline cursor-pointer"
                            >
                              {isOriginalShown ? '收起英文原文核对' : '核对本段英文原文'}
                            </button>
                          </div>
                        </div>

                        {/* Pure Chinese Academic Prose with Clickable Sentence-Level Meaning Inquiry */}
                        <div className="text-base font-academic-serif text-slate-900 leading-[1.85] tracking-[0.01em]">
                          {splitAcademicParagraphIntoSentences(para.translatedZhText).map(
                            (sentence, sIdx) => {
                              const isSentenceSelected =
                                isParaActive && selectedTextSnippet === sentence;
                              return (
                                <span
                                  key={`${para.id}-sent-${sIdx}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectSentenceForInquiry(para.id, sentence, false);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleSelectSentenceForInquiry(para.id, sentence, false);
                                    }
                                  }}
                                  title="点击选中此句，可一键询问这句话的意思或围绕此句与 AI 自由对话"
                                  className={`inline rounded px-0.5 transition-colors cursor-pointer ${
                                    isSentenceSelected
                                      ? 'bg-blue-100/90 text-blue-950 underline decoration-blue-600 decoration-2 underline-offset-4'
                                      : 'hover:bg-blue-50/80 hover:underline decoration-blue-300 underline-offset-4'
                                  }`}
                                >
                                  <MixedAcademicText text={sentence} />{' '}
                                </span>
                              );
                            }
                          )}
                        </div>

                        {/* Inline Sentence Inquiry Action Bar when a sentence in this paragraph is selected */}
                        {isParaActive && selectedTextSnippet && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="p-3 bg-blue-50/90 border border-blue-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                          >
                            <div className="text-slate-800 line-clamp-2">
                              <span className="font-semibold text-blue-900">已选中句子：</span>
                              「<MixedAcademicText text={selectedTextSnippet} />」
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={isSendingChat}
                                onClick={() =>
                                  handleSelectSentenceForInquiry(
                                    para.id,
                                    selectedTextSnippet,
                                    true
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>询问这句话的意思</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (chatPanelRef.current && window.innerWidth < 1024) {
                                    chatPanelRef.current.scrollIntoView({
                                      behavior: 'smooth',
                                      block: 'start',
                                    });
                                  }
                                  chatInputRef.current?.focus();
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 font-medium rounded transition-colors cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>围绕此句自由提问</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedTextSnippet('')}
                                className="px-2 py-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                取消选中
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Optional Original English Verification Drawer */}
                        {isOriginalShown && (
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono-tabular text-slate-600 leading-relaxed">
                            <div className="font-semibold text-slate-800 mb-1">
                              英文原文片段 (供忠实度独立核验)：
                            </div>
                            {para.originalEnExcerpt}
                          </div>
                        )}

                        {/* Preserved Mathematical Equations */}
                        {para.equations &&
                          para.equations.map((eq) => (
                            <div
                              key={eq.number}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectParagraphContext(
                                  para.id,
                                  null,
                                  `请帮我一步步推导 §${section.sectionNumber}.${para.paragraphIndex} 中的公式 (${eq.number})，并解释每个符号的物理意义。`,
                                  false,
                                  true
                                );
                              }}
                              title="点击此公式可直接向右侧 Gemini 伴读导师提问"
                            >
                              <LatexBlock
                                latex={eq.latex}
                                displayMode={true}
                                equationNumber={eq.number}
                              />
                            </div>
                          ))}

                        {/* Interactive Mathematical Derivation Mind Map Tree */}
                        {isMindMapOpen && generatedMindMap && (
                          <DerivationMindMap
                            tree={generatedMindMap}
                            isRegenerating={isGeneratingMindMap}
                            onRegenerate={() =>
                              handleGenerateMindMap(
                                para,
                                section.sectionNumber,
                                section.titleZh,
                                true
                              )
                            }
                            onCollapsePanel={() => {
                              setOpenMindMapIds((prev) => {
                                const next = new Set(prev);
                                next.delete(para.id);
                                return next;
                              });
                            }}
                            onAskGeminiAboutNode={(node) => {
                              handleSelectParagraphContext(
                                para.id,
                                null,
                                `针对 §${section.sectionNumber}.${para.paragraphIndex} 数学推导思维导图中的步骤「${node.title}」${
                                  node.formulaLatex ? `（公式 $${node.formulaLatex}$）` : ''
                                }，请进一步详细解释这一步是如何推导出来的？`,
                                false,
                                true
                              );
                            }}
                          />
                        )}

                        {/* Inline Precision Annotations Following Immediately After the Paragraph / Formula */}
                        <div className="space-y-4">
                          {(para.annotations || []).map((ann) => {
                            if (!ann) return null;
                            if (
                              selectedAnnotationType !== 'ALL' &&
                              ann.type !== selectedAnnotationType
                            ) {
                              return null;
                            }

                            const visibility = shouldDisplayAnnotation(
                              ann,
                              knowledgeNodes,
                              showSuppressedK1
                            );

                            if (!visibility.visible) {
                              return (
                                <div
                                  key={ann.id}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500"
                                >
                                  <div>
                                    <span className="font-mono-tabular font-semibold text-slate-700">
                                      [已省略 K1 基础批注]
                                    </span>{' '}
                                    <span>
                                      「{ann.targetConceptZh} ({ann.targetConceptEn})」在您的个人知识模型中属于已掌握的 K1 基础知识，已遵循“不重复解释已知内容”原则自动折叠。
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onDynamicFeedback(
                                        ann.targetConceptZh,
                                        ann.targetConceptEn,
                                        'mark_unfamiliar',
                                        `用户请求重新展开「${ann.targetConceptZh}」的完整解释`
                                      )
                                    }
                                    className="text-blue-600 hover:underline shrink-0 cursor-pointer"
                                  >
                                    我对此概念仍存疑 → 降为 K3 并展开批注
                                  </button>
                                </div>
                              );
                            }

                            const isAnnFocused = focusedAnnotation?.id === ann.id;

                            return (
                              <aside
                                key={ann.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectParagraphContext(para.id, ann);
                                }}
                                aria-label={`精准批注：${ann.targetConceptZh}`}
                                className={`border rounded-lg p-5 space-y-4 transition-colors ${
                                  isAnnFocused
                                    ? 'bg-blue-50/40 border-blue-400'
                                    : 'bg-slate-50/90 border-slate-200'
                                }`}
                              >
                                {/* Annotation Title Bar following Stage 6 Specification: 【批注类型｜目标概念】 */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-mono-tabular text-slate-500">
                                      <span>知识分级：{visibility.currentLevel}</span>
                                      <span aria-hidden="true"> · </span>
                                      <span>
                                        对应位置：<MixedAcademicText text={ann.targetEquationOrClause} />
                                      </span>
                                      {ann.derivationAuthenticity && (
                                        <>
                                          <span aria-hidden="true"> · </span>
                                          <span className="font-semibold text-blue-800">
                                            【{ann.derivationAuthenticity}】
                                          </span>
                                        </>
                                      )}
                                      <span aria-hidden="true"> · </span>
                                      <span>资料核验：{ann.verificationStatus}</span>
                                    </div>
                                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                                      【{ann.type}｜<MixedAcademicText text={ann.targetConceptZh} />（
                                      <MixedAcademicText text={ann.targetConceptEn} />）】
                                    </h3>
                                  </div>

                                  {/* Dynamic Knowledge Feedback Controls (Stage 5) */}
                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDynamicFeedback(
                                          ann.targetConceptZh,
                                          ann.targetConceptEn,
                                          'mark_mastered'
                                        );
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>已掌握 (升为 K1 折叠)</span>
                                    </button>
                                  </div>
                                </div>

                                {/* 7-Dimension Deep Explanation Body */}
                                <div className="space-y-3 text-xs sm:text-sm text-slate-800 leading-relaxed">
                                  <div>
                                    <span className="font-semibold text-slate-900">
                                      1. 概念实质与数学定义：
                                    </span>
                                    <MixedAcademicText text={ann.whatItIs} />
                                  </div>

                                  <div>
                                    <span className="font-semibold text-slate-900">
                                      2. 为何在此出现（与您已读教材的衔接障碍）：
                                    </span>
                                    <MixedAcademicText text={ann.whyHereAndRole} />
                                  </div>

                                  {ann.prerequisitesNeeded && (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        3. 必需前置知识锚点：
                                      </span>
                                      <MixedAcademicText text={ann.prerequisitesNeeded} />
                                    </div>
                                  )}

                                  <div>
                                    <span className="font-semibold text-slate-900">
                                      4. 核心数学与物理机制：
                                    </span>
                                    <MixedAcademicText text={ann.mathOrPhysicalMechanism} />
                                  </div>

                                  {ann.commonMisconceptions && (
                                    <div className="p-3 bg-white border border-slate-200 rounded-md">
                                      <span className="font-semibold text-amber-900">
                                        5. 关键辨析与常见误区：
                                      </span>
                                      <MixedAcademicText text={ann.commonMisconceptions} />
                                    </div>
                                  )}

                                  {ann.impactOnSubsequentArgs && (
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        6. 对后续论证与全文结论的影响：
                                      </span>
                                      <MixedAcademicText text={ann.impactOnSubsequentArgs} />
                                    </div>
                                  )}
                                </div>

                                {/* Stage 4: Deep Mathematical Formula Breakdown & Step-by-Step Derivation */}
                                {ann.formulaAnalysis && (
                                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                                        <span>
                                          核心公式 ({ann.formulaAnalysis.equationNumber}) 符号拆解与分步推导核验
                                        </span>
                                      </div>
                                      <div className="text-xs font-mono-tabular text-slate-500">
                                        来源：{ann.formulaAnalysis.originAndContext}
                                      </div>
                                    </div>

                                    {/* Symbol Dictionary Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white p-3.5 border border-slate-200 rounded-md">
                                      {(ann.formulaAnalysis.symbols || []).map((sym, sIdx) => (
                                        <div key={sIdx} className="flex items-baseline gap-2">
                                          <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                                            <LatexBlock latex={sym?.symbolLatex || ''} /> :
                                          </span>
                                          <span className="text-slate-600">
                                            <MixedAcademicText text={sym?.meaningZh || ''} />
                                          </span>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Theorems & Validity Conditions */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                      <div className="p-3 bg-white border border-slate-200 rounded">
                                        <span className="font-semibold text-slate-900">
                                          使用的数学定理依据：
                                        </span>
                                        <span className="text-slate-700 ml-1">
                                          <MixedAcademicText
                                            text={(ann.formulaAnalysis.theoremsUsed || []).join('；')}
                                          />
                                        </span>
                                      </div>
                                      <div className="p-3 bg-white border border-slate-200 rounded">
                                        <span className="font-semibold text-slate-900">
                                          公式成立的物理/数学条件：
                                        </span>
                                        <span className="text-slate-700 ml-1">
                                          <MixedAcademicText
                                            text={ann.formulaAnalysis.validityConditions || ''}
                                          />
                                        </span>
                                      </div>
                                    </div>

                                    {/* Step-by-Step Derivation strictly distinguishing 原文推导 / 补充推导 / 独立核验 */}
                                    <div className="space-y-3">
                                      <div className="text-xs font-semibold text-slate-800">
                                        关键中间推导步骤（严格区分作者原文与 AI 补充推导）：
                                      </div>
                                      {(ann.formulaAnalysis.derivationSteps || []).map((step, stepIdx) => (
                                        <div
                                          key={step?.stepIndex ?? stepIdx}
                                          className="p-3.5 bg-white border border-slate-200 rounded-md space-y-2"
                                        >
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="font-mono-tabular font-semibold text-slate-900">
                                              步骤 {step?.stepIndex ?? stepIdx + 1} · 【{step?.sourceType || '原文推导'}】
                                            </span>
                                            <span className="text-slate-400 font-mono-tabular">
                                              {step?.sourceType === '原文推导'
                                                ? '论文作者显式给出的步骤'
                                                : step?.sourceType === '补充推导'
                                                ? '为跨越理解障碍补充的被省略步骤'
                                                : '独立核验量纲、系数或极限一致性'}
                                            </span>
                                          </div>
                                          <p className="text-xs text-slate-700 leading-relaxed">
                                            <MixedAcademicText text={step?.descriptionZh || ''} />
                                          </p>
                                          <LatexBlock latex={step?.latex || ''} displayMode={true} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </aside>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>
        </article>

        {/* Interactive Vertical Drag Resizer Handle between Paper Manuscript & AI Companion */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整论文批注文稿与 AI 导读栏宽度比例"
          aria-valuenow={leftPanePercent}
          aria-valuemin={MIN_MANUSCRIPT_WIDTH_PERCENT}
          aria-valuemax={MAX_MANUSCRIPT_WIDTH_PERCENT}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingSplit(true);
          }}
          onTouchStart={() => {
            setIsDraggingSplit(true);
          }}
          onDoubleClick={() => updateManuscriptWidth(DEFAULT_MANUSCRIPT_WIDTH_PERCENT)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              updateManuscriptWidth(leftPanePercent - 2);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              updateManuscriptWidth(leftPanePercent + 2);
            } else if (e.key === 'Home') {
              e.preventDefault();
              updateManuscriptWidth(MIN_MANUSCRIPT_WIDTH_PERCENT);
            } else if (e.key === 'End') {
              e.preventDefault();
              updateManuscriptWidth(MAX_MANUSCRIPT_WIDTH_PERCENT);
            }
          }}
          title="左右拖动可自由调整论文批注与 AI 导读栏宽度（双击恢复默认 58:42）"
          className="hidden lg:flex lg:sticky lg:top-20 lg:h-[780px] lg:w-5 lg:shrink-0 flex-col items-center justify-center cursor-col-resize group select-none focus:outline-none"
        >
          <div
            className={`w-0.5 h-full rounded-full transition-colors ${
              isDraggingSplit
                ? 'bg-blue-600'
                : 'bg-slate-200/80 group-hover:bg-blue-400 group-focus:bg-blue-500'
            }`}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 px-1 py-2.5 rounded-md border shadow-2xs transition-colors ${
              isDraggingSplit
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-500 border-slate-300 group-hover:border-blue-400 group-hover:text-blue-600 group-focus:border-blue-500'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div
            className={`absolute top-6 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono-tabular whitespace-nowrap shadow-xs pointer-events-none transition-opacity ${
              isDraggingSplit ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus:opacity-100'
            }`}
          >
            {leftPanePercent}% : {100 - leftPanePercent}%
          </div>
        </div>

        {/* Right Column: Multi-Turn Location-Aware Gemini Paper Companion Chatbot */}
        <aside
          ref={chatPanelRef}
          aria-label="Gemini 论文伴读导师"
          className="w-full lg:flex-1 lg:min-w-0 lg:sticky lg:top-20 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col h-[780px]"
        >
          {/* Chatbot Header */}
          <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-900 text-white rounded-t-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <h3 className="text-sm font-bold tracking-tight">
                  Gemini 论文伴读导师（实时位置感知）
                </h3>
              </div>
              <span className="text-[11px] font-mono-tabular text-emerald-300">
                ● 随时知道您在问哪里
              </span>
            </div>

            {/* Real-Time Location Awareness Anchor Box */}
            <div className="p-2.5 bg-slate-800/95 border border-slate-700 rounded text-xs space-y-1.5 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 text-blue-300 font-semibold min-w-0 truncate">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">当前感知位置：{activeLocationBadge}</span>
                </div>
                <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                  {locationUpdateMode === 'selection'
                    ? '通过划词锁定'
                    : locationUpdateMode === 'click'
                    ? '通过点击锁定'
                    : '随滚动自动同步'}
                </span>
              </div>

              {/* Quick Paragraph Context Switcher */}
              <div className="flex items-center gap-2 pt-0.5 min-w-0">
                <label htmlFor="chatbot-location-select" className="text-[11px] text-slate-400 shrink-0">
                  切换定位段落：
                </label>
                <select
                  id="chatbot-location-select"
                  value={activeParagraphId}
                  onChange={(e) => {
                    const newPid = e.target.value;
                    setActiveParagraphId(newPid);
                    setFocusedAnnotation(null);
                    setLocationUpdateMode('click');
                    const el = paragraphRefs.current[newPid];
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="flex-1 min-w-0 truncate bg-slate-900 text-slate-100 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono-tabular focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {flatLocations.map((loc) => {
                    const qCount = questionCountByParagraph[loc.paragraph.id] || 0;
                    return (
                      <option key={loc.paragraph.id} value={loc.paragraph.id}>
                        §{loc.sectionNumber}.{loc.paragraph.paragraphIndex}{' '}
                        {loc.sectionTitleZh.slice(0, 18)}
                        {loc.paragraph.equations?.[0]
                          ? ` (公式 ${loc.paragraph.equations[0].number})`
                          : ''}
                        {qCount > 0 ? ` [${qCount}问]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Persistence & Paragraph History Filter Bar */}
              <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setOnlyCurrentParagraphChat(false)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      !onlyCurrentParagraphChat
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    全部对话 ({totalUserQuestions} 问)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyCurrentParagraphChat(true)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      onlyCurrentParagraphChat
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    仅看当前段 ({questionCountByParagraph[activeParagraphId] || 0} 问)
                  </button>
                </div>

                {totalUserQuestions > 0 && (
                  <button
                    type="button"
                    onClick={handleClearPaperChatHistory}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="清空当前论文的伴读对话记录"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>清空记录</span>
                  </button>
                )}
              </div>

              {/* If user highlighted text in the manuscript, show it here */}
              {selectedTextSnippet && (
                <div className="p-2 bg-blue-950/80 border border-blue-700/80 rounded flex items-start justify-between gap-2 text-[11px] text-blue-100">
                  <div className="line-clamp-2">
                    <span className="font-semibold text-blue-300">已选中句子/片段：</span>
                    「<MixedAcademicText text={selectedTextSnippet} />」
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTextSnippet('')}
                    aria-label="清除划选片段"
                    className="text-blue-300 hover:text-white shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Multi-Turn Conversation Thread */}
          <div
            ref={chatScrollRef}
            data-testid="paper-chat-thread"
            className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/60"
          >
            {displayedChatTurns.length === 0 ? (
              <div className="p-5 bg-white border border-slate-200 rounded-lg text-center space-y-2 text-xs text-slate-500">
                <div>
                  当前段落（§
                  {activeLocationObj
                    ? `${activeLocationObj.sectionNumber}.${activeLocationObj.paragraph.paragraphIndex}`
                    : '1.1'}
                  ）暂无历史提问记录。
                </div>
                <button
                  type="button"
                  onClick={() => setOnlyCurrentParagraphChat(false)}
                  className="text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  查看本篇论文全部伴读记录 ({totalUserQuestions} 问)
                </button>
              </div>
            ) : (
              displayedChatTurns.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="text-[10px] font-mono-tabular text-slate-400 mb-1 flex items-center gap-1.5 max-w-full">
                  <span className="shrink-0">{turn.role === 'user' ? '您的提问' : 'Gemini 伴读导师'}</span>
                  <span className="shrink-0">·</span>
                  <button
                    type="button"
                    onClick={() => handleSelectParagraphContext(turn.paragraphId, null, undefined, true)}
                    className="text-blue-600 hover:underline font-medium truncate max-w-[270px] cursor-pointer"
                    title="点击定位回文稿对应段落"
                  >
                    <MixedAcademicText text={turn.locationLabel} />
                  </button>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0">{turn.timestamp}</span>
                </div>

                <div
                  className={`max-w-[94%] rounded-lg p-3.5 text-xs sm:text-sm leading-relaxed space-y-2.5 ${
                    turn.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-2xs'
                  }`}
                >
                  <div className="whitespace-pre-line">
                    <MixedAcademicText text={turn.content} />
                  </div>

                  {turn.role === 'assistant' && turn.generationMeta?.degraded && (
                    <DiagnosticAlert
                      variant={turn.id.startsWith('err-') ? 'error' : 'degraded'}
                      title={
                        turn.id.startsWith('err-')
                          ? '伴读导师请求失败'
                          : '伴读导师当前响应已降级'
                      }
                      message={
                        turn.generationMeta.reason ||
                        '未能从 Gemini 获取实时推导回复，未虚构物理结论。'
                      }
                      meta={turn.generationMeta}
                      retryLabel="重新向 Gemini 提问"
                      isRetrying={isSendingChat}
                      onRetry={() =>
                        handleSendChatMessage(turn.retryPrompt || '请重新解答上一问题')
                      }
                    />
                  )}

                  {/* Button to pin Gemini's explanation directly into the active paragraph's annotations */}
                  {turn.role === 'assistant' &&
                    turn.suggestedAnnotation &&
                    onAppendAnnotation && (
                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          可将此解答直接写入左侧正文对应段落：
                        </span>
                        <button
                          type="button"
                          disabled={turn.pinnedToManuscript}
                          onClick={() => handlePinChatAnswerToManuscript(turn)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                            turn.pinnedToManuscript
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                        >
                          {turn.pinnedToManuscript ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>已补充为本段批注</span>
                            </>
                          ) : (
                            <>
                              <PlusCircle className="w-3.5 h-3.5" />
                              <span>将此解答补充为本段批注</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                </div>
              </div>
            ))
            )}

            {isSendingChat && (
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                <span>
                  Gemini 正在结合您当前所在的【{activeLocationBadge}】及您的 K1–K4 知识背景进行推导...
                </span>
              </div>
            )}
          </div>

          {/* Quick Contextual Question Shortcuts & Input Box */}
          <div className="p-3.5 border-t border-slate-200 bg-white rounded-b-lg space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedTextSnippet && (
                <button
                  type="button"
                  disabled={isSendingChat}
                  onClick={() =>
                    handleSendChatMessage(
                      `请帮我详细解释这句话的意思：「${selectedTextSnippet}」，包括它的字面含义、背后的物理/数学实质，以及在当前段落论证中的作用。`,
                      { selectedSentence: selectedTextSnippet }
                    )
                  }
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                >
                  询问所选句子的意思
                </button>
              )}
              <button
                type="button"
                disabled={isSendingChat}
                onClick={() =>
                  handleSendChatMessage(
                    selectedTextSnippet
                      ? `请结合上下文推导并解释我所选句子「${selectedTextSnippet}」涉及的数学关系与物理图像。`
                      : '请一步步推导我当前正在看的这一段中的核心公式，把作者省略的中间步骤补齐。'
                  )
                }
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
              >
                推导当前位置公式
              </button>
              <button
                type="button"
                disabled={isSendingChat}
                onClick={() =>
                  handleSendChatMessage(
                    '请结合我已经读过的教材章节（K1），解释我现在看的这一段的核心物理图像是什么？'
                  )
                }
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
              >
                解释本段物理机制
              </button>
              <button
                type="button"
                disabled={isSendingChat}
                onClick={() =>
                  handleSendChatMessage(
                    '我当前看的这一段有哪些隐含的物理假设、适用范围或容易混淆的符号？'
                  )
                }
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer"
              >
                辨析隐含假设与符号
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              className="flex gap-2"
            >
              <label htmlFor="gemini-paper-chat-input" className="sr-only">
                向 Gemini 论文伴读导师提问
              </label>
              <input
                ref={chatInputRef}
                id="gemini-paper-chat-input"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  selectedTextSnippet
                    ? `围绕所选句子「${selectedTextSnippet.slice(0, 16)}...」自由提问，或询问任何问题...`
                    : `针对「${
                        activeLocationObj
                          ? `§${activeLocationObj.sectionNumber}.${activeLocationObj.paragraph.paragraphIndex}`
                          : '当前论文'
                      }」自由对话提问（如：这句话是什么意思？这里第二项为什么抵消了？）...`
                }
                className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={isSendingChat || !chatInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>发送</span>
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};

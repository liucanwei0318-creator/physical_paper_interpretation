import type {
  ActiveWorkspaceTab,
  DerivationMindMapTree,
  PaperChatTurn,
  PersistedWorkspaceState,
  TranslatedPaperDocument,
} from '../types/physics.ts';
import { normalizeWorkspaceSettings } from './annotationSettings.ts';

export const WORKSPACE_STORAGE_KEY = 'physica_annotate_workspace_v2';

const VALID_TABS: ReadonlySet<ActiveWorkspaceTab> = new Set([
  'knowledge',
  'pre_analysis',
  'translation',
  'verification',
]);

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): StorageAdapter | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizePersistedWorkspaceState(
  rawParsed: unknown
): PersistedWorkspaceState | null {
  if (!rawParsed || typeof rawParsed !== 'object') {
    return null;
  }

  const candidate = rawParsed as Partial<PersistedWorkspaceState>;
  const safeChatHistory: Record<string, PaperChatTurn[]> = {};

  if (candidate.paperChatHistory && typeof candidate.paperChatHistory === 'object') {
    for (const [paperId, turns] of Object.entries(candidate.paperChatHistory)) {
      if (Array.isArray(turns)) {
        safeChatHistory[paperId] = turns.filter(
          (t): t is PaperChatTurn =>
            Boolean(t) &&
            typeof t === 'object' &&
            typeof t.id === 'string' &&
            (t.role === 'user' || t.role === 'assistant') &&
            typeof t.content === 'string' &&
            typeof t.paragraphId === 'string'
        );
      }
    }
  }

  const safeActiveParagraphMap: Record<string, string> = {};
  if (
    candidate.activeParagraphByPaperId &&
    typeof candidate.activeParagraphByPaperId === 'object'
  ) {
    for (const [paperId, pid] of Object.entries(candidate.activeParagraphByPaperId)) {
      if (typeof pid === 'string' && pid.trim().length > 0) {
        safeActiveParagraphMap[paperId] = pid;
      }
    }
  }

  const safeActiveTab: ActiveWorkspaceTab =
    candidate.activeTab && VALID_TABS.has(candidate.activeTab)
      ? candidate.activeTab
      : 'knowledge';

  const safeMindMaps: Record<string, Record<string, DerivationMindMapTree>> = {};
  if (
    candidate.derivationMindMapsByPaperId &&
    typeof candidate.derivationMindMapsByPaperId === 'object'
  ) {
    for (const [paperId, mapObj] of Object.entries(candidate.derivationMindMapsByPaperId)) {
      if (mapObj && typeof mapObj === 'object') {
        safeMindMaps[paperId] = mapObj;
      }
    }
  }

  return {
    materials: Array.isArray(candidate.materials) ? candidate.materials : [],
    knowledgeNodes: Array.isArray(candidate.knowledgeNodes) ? candidate.knowledgeNodes : [],
    report: candidate.report ?? null,
    currentPreAnalysis: candidate.currentPreAnalysis ?? null,
    currentDocument: candidate.currentDocument ?? null,
    paperTitleEn: typeof candidate.paperTitleEn === 'string' ? candidate.paperTitleEn : '',
    paperAuthors: typeof candidate.paperAuthors === 'string' ? candidate.paperAuthors : '',
    paperArxivId: typeof candidate.paperArxivId === 'string' ? candidate.paperArxivId : '',
    paperRawText: typeof candidate.paperRawText === 'string' ? candidate.paperRawText : '',
    isPreAnalysisConfirmed: Boolean(candidate.isPreAnalysisConfirmed),
    feedbackHistory: Array.isArray(candidate.feedbackHistory) ? candidate.feedbackHistory : [],
    paperChatHistory: safeChatHistory,
    activeParagraphByPaperId: safeActiveParagraphMap,
    activeTab: safeActiveTab,
    derivationMindMapsByPaperId: safeMindMaps,
    settings: normalizeWorkspaceSettings(candidate.settings),
  };
}

export function loadSavedWorkspace(
  storage: StorageAdapter | null = getBrowserStorage()
): PersistedWorkspaceState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizePersistedWorkspaceState(parsed);
  } catch {
    return null;
  }
}

export function saveWorkspaceState(
  state: PersistedWorkspaceState,
  storage: StorageAdapter | null = getBrowserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedWorkspace(
  storage: StorageAdapter | null = getBrowserStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

export function createWelcomeChatTurn(
  paperDoc: Pick<TranslatedPaperDocument, 'titleZh' | 'sections'>,
  firstParagraphId?: string
): PaperChatTurn {
  const fallbackParagraphId =
    firstParagraphId || paperDoc.sections[0]?.paragraphs[0]?.id || 'p-1-1';

  return {
    id: 'welcome-turn',
    role: 'assistant',
    locationLabel: '逐句精读与自由对话已就绪',
    paragraphId: fallbackParagraphId,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    content:
      `您好！我是您的 **AI 论文精读对话助手**。\n\n` +
      `我已实时连接左侧的 **《${paperDoc.titleZh}》** 文稿与您的 **K1–K4 个人知识背景**，您可以通过以下两种方式随时与我对话：\n` +
      `- **询问某句话的意思**：直接**点击左侧正文中的任意一句话**（或用鼠标划选任意词句/公式），即可一键询问「这句话的意思」，或围绕这句话提出您的具体问题。\n` +
      `- **自由对话提问**：随时在下方输入框自由输入任何问题（不局限于特定按钮或模板），与我进行多轮探讨。`,
  };
}

/**
 * Splits Chinese or English academic prose into individual sentences while preserving
 * inline ($...$) and display ($$...$$) LaTeX math expressions intact.
 */
export function splitAcademicParagraphIntoSentences(text: string): string[] {
  const raw = (text || '').trim();
  if (!raw) return [];

  const sentences: string[] = [];
  let current = '';
  let inDisplayMath = false;
  let inInlineMath = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    // Toggle $$...$$ or $...$ math states (ignoring escaped \$)
    if (ch === '$' && raw[i - 1] !== '\\') {
      if (next === '$') {
        inDisplayMath = !inDisplayMath;
        current += '$$';
        i++;
        continue;
      } else if (!inDisplayMath) {
        inInlineMath = !inInlineMath;
        current += '$';
        continue;
      }
    }

    current += ch;

    if (!inDisplayMath && !inInlineMath) {
      // Chinese sentence-ending punctuation
      if (ch === '。' || ch === '！' || ch === '？' || ch === '；') {
        // Include closing quotes/brackets immediately following punctuation
        while (
          i + 1 < raw.length &&
          /[”’」』）》\]"']/.test(raw[i + 1])
        ) {
          current += raw[++i];
        }
        const trimmed = current.trim();
        if (trimmed) sentences.push(trimmed);
        current = '';
        continue;
      }

      // English sentence-ending period/exclamation/question followed by whitespace and capital/math
      if ((ch === '.' || ch === '!' || ch === '?') && /\s/.test(next || '')) {
        const tail = current.slice(-10);
        const isAbbrev =
          /\b(?:Eq|Eqs|Fig|Figs|Sec|Secs|Ref|Refs|al|i\.e|e\.g|cf|vs|Dr|Prof|No)\.$/.test(tail) ||
          /\b[A-Z]\.$/.test(tail);
        if (!isAbbrev) {
          const trimmed = current.trim();
          if (trimmed) sentences.push(trimmed);
          current = '';
        }
      }
    }
  }

  const remaining = current.trim();
  if (remaining) {
    sentences.push(remaining);
  }

  return sentences.length > 0 ? sentences : [raw];
}

export function getChatTurnsForPaper(
  historyMap: Record<string, PaperChatTurn[]> | undefined,
  paperDoc: Pick<TranslatedPaperDocument, 'paperId' | 'titleZh' | 'sections'>
): PaperChatTurn[] {
  const existing = historyMap?.[paperDoc.paperId];
  if (existing && existing.length > 0) {
    return existing;
  }
  return [createWelcomeChatTurn(paperDoc)];
}

export function upsertPaperChatTurns(
  historyMap: Record<string, PaperChatTurn[]>,
  paperId: string,
  turns: PaperChatTurn[]
): Record<string, PaperChatTurn[]> {
  return {
    ...historyMap,
    [paperId]: turns,
  };
}

export function filterChatTurnsByParagraph(
  turns: PaperChatTurn[],
  paragraphId: string,
  onlyCurrentParagraph: boolean
): PaperChatTurn[] {
  if (!onlyCurrentParagraph) return turns;
  return turns.filter(
    (turn) => turn.id !== 'welcome-turn' && turn.paragraphId === paragraphId
  );
}

export function countUserQuestionsByParagraph(
  turns: PaperChatTurn[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const turn of turns) {
    if (turn.role === 'user' && turn.paragraphId) {
      counts[turn.paragraphId] = (counts[turn.paragraphId] || 0) + 1;
    }
  }
  return counts;
}


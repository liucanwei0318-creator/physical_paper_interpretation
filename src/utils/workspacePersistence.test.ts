import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_STORAGE_KEY,
  StorageAdapter,
  loadSavedWorkspace,
  saveWorkspaceState,
  clearSavedWorkspace,
  normalizePersistedWorkspaceState,
  getChatTurnsForPaper,
  upsertPaperChatTurns,
  filterChatTurnsByParagraph,
  countUserQuestionsByParagraph,
} from './workspacePersistence';
import {
  PaperChatTurn,
  PersistedWorkspaceState,
  TranslatedPaperDocument,
} from '../types/physics';

function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

const samplePaper: TranslatedPaperDocument = {
  paperId: 'paper-ads-cft-01',
  titleZh: '非微扰规范理论中的全息重整化流',
  titleEn: 'Holographic Renormalization Flow in Non-Perturbative Gauge Theory',
  authors: 'A. Physicist',
  institutionOrJournal: 'JHEP',
  arxivIdOrDoi: 'arXiv:2401.00001',
  abstractZh: '本文研究全息重整化群流。',
  sections: [
    {
      sectionNumber: '1',
      titleZh: '引言与作用量',
      titleEn: 'Introduction and Action',
      paragraphs: [
        {
          id: 'p-1-1',
          paragraphIndex: 1,
          statementType: '正文论述',
          originalEnExcerpt: 'Consider the bulk action.',
          translatedZhText: '考虑体时空作用量。',
          annotations: [],
        },
        {
          id: 'p-1-2',
          paragraphIndex: 2,
          statementType: '核心定理/引理',
          originalEnExcerpt: 'The boundary counterterm cancels UV divergences.',
          translatedZhText: '边界抵消项消除紫外发散。',
          annotations: [],
        },
      ],
    },
  ],
  terminologyTable: [],
  citations: [],
  groundingSources: [],
};

test('PersistedWorkspaceState saves and restores paperChatHistory across reloads', () => {
  const storage = createMemoryStorage();

  const chatTurns: PaperChatTurn[] = [
    {
      id: 'welcome-turn',
      role: 'assistant',
      content: '欢迎使用伴读导师',
      locationLabel: '实时位置感知已就绪',
      paragraphId: 'p-1-1',
      timestamp: '10:00:00',
    },
    {
      id: 'user-1',
      role: 'user',
      content: '为什么边界抵消项的系数恰好取 1/2？',
      locationLabel: '§1.2《引言与作用量》',
      paragraphId: 'p-1-2',
      timestamp: '10:01:12',
    },
    {
      id: 'ai-1',
      role: 'assistant',
      content: '因为在 Fefferman-Graham 展开中二阶变分边界项要求系数为 1/2。',
      locationLabel: '§1.2《引言与作用量》',
      paragraphId: 'p-1-2',
      timestamp: '10:01:15',
      pinnedToManuscript: true,
    },
  ];

  const workspace: PersistedWorkspaceState = {
    materials: [],
    knowledgeNodes: [],
    report: null,
    currentPreAnalysis: null,
    currentDocument: samplePaper,
    paperTitleEn: samplePaper.titleEn,
    paperAuthors: samplePaper.authors,
    paperArxivId: samplePaper.arxivIdOrDoi,
    paperRawText: 'Consider the bulk action.',
    isPreAnalysisConfirmed: true,
    feedbackHistory: [],
    paperChatHistory: upsertPaperChatTurns({}, samplePaper.paperId, chatTurns),
    activeParagraphByPaperId: { [samplePaper.paperId]: 'p-1-2' },
    activeTab: 'translation',
    settings: { annotationDetailLevel: 5 },
  };

  assert.equal(saveWorkspaceState(workspace, storage), true);

  const restored = loadSavedWorkspace(storage);
  assert.ok(restored);
  assert.equal(restored.activeTab, 'translation');
  assert.equal(restored.activeParagraphByPaperId?.[samplePaper.paperId], 'p-1-2');
  assert.equal(restored.settings?.annotationDetailLevel, 5);

  const restoredTurns = getChatTurnsForPaper(restored.paperChatHistory, samplePaper);
  assert.equal(restoredTurns.length, 3);
  assert.equal(restoredTurns[1]?.paragraphId, 'p-1-2');
  assert.equal(restoredTurns[1]?.content, '为什么边界抵消项的系数恰好取 1/2？');
  assert.equal(restoredTurns[2]?.pinnedToManuscript, true);

  clearSavedWorkspace(storage);
  assert.equal(storage.getItem(WORKSPACE_STORAGE_KEY), null);
  assert.equal(loadSavedWorkspace(storage), null);
});

test('normalizePersistedWorkspaceState safely upgrades legacy workspace payloads without paperChatHistory', () => {
  const legacyPayload = {
    materials: [],
    knowledgeNodes: [],
    report: null,
    currentPreAnalysis: null,
    currentDocument: samplePaper,
    paperTitleEn: samplePaper.titleEn,
    paperAuthors: samplePaper.authors,
    paperArxivId: samplePaper.arxivIdOrDoi,
    paperRawText: '',
    isPreAnalysisConfirmed: true,
    feedbackHistory: [],
  };

  const normalized = normalizePersistedWorkspaceState(legacyPayload);
  assert.ok(normalized);
  assert.deepEqual(normalized.paperChatHistory, {});
  assert.equal(normalized.activeTab, 'knowledge');
  assert.equal(normalized.settings?.annotationDetailLevel, 3);

  const fallbackTurns = getChatTurnsForPaper(normalized.paperChatHistory, samplePaper);
  assert.equal(fallbackTurns.length, 1);
  assert.equal(fallbackTurns[0]?.id, 'welcome-turn');
  assert.equal(fallbackTurns[0]?.paragraphId, 'p-1-1');
});

test('filterChatTurnsByParagraph and countUserQuestionsByParagraph isolate paragraph-specific Q&A records', () => {
  const turns: PaperChatTurn[] = [
    {
      id: 'welcome-turn',
      role: 'assistant',
      content: 'welcome',
      locationLabel: '就绪',
      paragraphId: 'p-1-1',
      timestamp: '10:00:00',
    },
    {
      id: 'u1',
      role: 'user',
      content: '问题 A',
      locationLabel: '§1.1',
      paragraphId: 'p-1-1',
      timestamp: '10:01:00',
    },
    {
      id: 'a1',
      role: 'assistant',
      content: '回答 A',
      locationLabel: '§1.1',
      paragraphId: 'p-1-1',
      timestamp: '10:01:03',
    },
    {
      id: 'u2',
      role: 'user',
      content: '问题 B',
      locationLabel: '§1.2',
      paragraphId: 'p-1-2',
      timestamp: '10:02:00',
    },
    {
      id: 'a2',
      role: 'assistant',
      content: '回答 B',
      locationLabel: '§1.2',
      paragraphId: 'p-1-2',
      timestamp: '10:02:04',
    },
  ];

  const counts = countUserQuestionsByParagraph(turns);
  assert.equal(counts['p-1-1'], 1);
  assert.equal(counts['p-1-2'], 1);

  const p2Only = filterChatTurnsByParagraph(turns, 'p-1-2', true);
  assert.equal(p2Only.length, 2);
  assert.equal(p2Only[0]?.id, 'u2');
  assert.equal(p2Only[1]?.id, 'a2');

  const allTurns = filterChatTurnsByParagraph(turns, 'p-1-2', false);
  assert.equal(allTurns.length, 5);
});

test('splitAcademicParagraphIntoSentences splits Chinese and English sentences while keeping LaTeX math intact', async () => {
  const { splitAcademicParagraphIntoSentences } = await import('./workspacePersistence');

  const zhParagraph =
    '考虑体时空作用量 $S_{\\text{bulk}} = \\int d^{d+1}x \\sqrt{-g} (R - 2\\Lambda)$。边界抵消项用于消除紫外发散；参见公式 $$\\delta S = \\frac{1}{2} \\int d^dx \\sqrt{-\\gamma} T_{ij} \\delta \\gamma^{ij}$$。因此全息重整化流保持有限！';

  const zhSentences = splitAcademicParagraphIntoSentences(zhParagraph);
  assert.equal(zhSentences.length, 4);
  assert.equal(
    zhSentences[0],
    '考虑体时空作用量 $S_{\\text{bulk}} = \\int d^{d+1}x \\sqrt{-g} (R - 2\\Lambda)$。'
  );
  assert.equal(zhSentences[1], '边界抵消项用于消除紫外发散；');
  assert.ok(zhSentences[2]?.includes('$$\\delta S = \\frac{1}{2}'));
  assert.equal(zhSentences[3], '因此全息重整化流保持有限！');

  const enParagraph =
    'As shown in Eq. (12), the drift velocity satisfies $v_d = \\mu F(x) + \\nabla \\cdot D(x)$. Consequently, spurious drift emerges when $\\nabla D \\neq 0$.';
  const enSentences = splitAcademicParagraphIntoSentences(enParagraph);
  assert.equal(enSentences.length, 2);
  assert.ok(enSentences[0]?.startsWith('As shown in Eq. (12)'));
  assert.ok(enSentences[1]?.startsWith('Consequently, spurious drift'));
});

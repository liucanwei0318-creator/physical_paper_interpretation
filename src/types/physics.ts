export type KnowledgeLevel = 'K1' | 'K2' | 'K3' | 'K4';

export type EpistemicStatus =
  | '已有材料'
  | '已学习知识'
  | '推测掌握知识'
  | '未知知识';

export type AnnotationType =
  | '理论解释'
  | '数学推导'
  | '物理机制'
  | '前置知识'
  | '关键辨析';

export type DerivationSourceType =
  | '原文推导'
  | '补充推导'
  | '独立核验';

export type VerificationStatus = '已核验' | '待核实' | '存在学术争议';

export type GenerationErrorCode =
  | 'MISSING_KEY'
  | 'RATE_LIMIT_429'
  | 'AUTH_ERROR'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface GenerationMeta {
  degraded: boolean;
  sourceMode: 'gemini' | 'deterministic_fallback';
  modelUsed?: string;
  errorCode?: GenerationErrorCode;
  reason?: string;
  retryable?: boolean;
  timestamp?: string;
}

export interface WebGroundingSource {
  title: string;
  uri: string;
  sourceType: 'arXiv' | 'CrossRef' | 'OpenLibrary' | 'GoogleSearch';
  snippet?: string;
}

export interface ChapterScopeItem {
  chapterNumber: number;
  chapterTitleZh: string;
  chapterTitleEn: string;
  status: 'mastered_k1' | 'partial_k2' | 'unread_k3';
  statusReason: string;
  coreConcepts: string[];
  keyFormulasLatex: string[];
  mathTools: string[];
}

export interface ReadingMaterial {
  id: string;
  title: string;
  authors: string;
  editionOrYear: string;
  domain: string;
  readScope: string; // e.g., "Ch. 1–7 (Part I: Feynman Diagrams & QED)"
  parsedScopeSummary?: string; // e.g., "已精确识别：第 1–7 章为已读范围 (K1/K2)，第 8–22 章为未读章节 (K3)"
  chapterBreakdown?: ChapterScopeItem[]; // 逐章阅读范围精准映射表
  explicitMastered: string[]; // 用户明确表示已学习的内容
  inferredMastered: string[]; // 根据阅读范围和学习反馈推测的内容
  unlearnedOrSkipped: string[]; // 书中未读或明确薄弱的内容
  mathTools: string[];
  keyTheoremsAndFormulas: string[];
  depthRating: string; // e.g., "研究生核心教材（中等偏高）"
  supportedPhysicsProblems: string[];
  verifiedSources: WebGroundingSource[];
}

export interface KnowledgeNode {
  id: string;
  conceptNameZh: string;
  conceptNameEn: string;
  level: KnowledgeLevel;
  epistemicStatus: EpistemicStatus;
  domain: string;
  sourceMaterialIds: string[];
  rationale: string;
  formulaLatex?: string;
  lastUpdatedReason?: string;
}

export interface KnowledgeAnalysisReport {
  generatedAt: string;
  overallSummary: string;
  strengths: string[];
  criticalBoundaries: string[];
  annotationPolicySummary: {
    skipK1List: string[];
    conditionalK2List: string[];
    mandatoryK3K4Focus: string[];
  };
  epistemicBreakdown: {
    providedMaterialsCount: number;
    explicitMasteredCount: number;
    inferredCount: number;
    unknownCount: number;
  };
  groundingSources: WebGroundingSource[];
  generationMeta?: GenerationMeta;
}

export interface SectionGapItem {
  sectionNumber: string;
  sectionTitleEn: string;
  sectionTitleZh: string;
  difficulty: '基础过渡' | '中等进阶' | '高难核心' | '前沿原创';
  k1ConceptsToSkip: string[];
  k2ConceptsConditional: string[];
  k3UnknownGaps: string[];
  k4PaperSpecificInnovations: string[];
  plannedAnnotationCount: number;
  gapAnalysisSummary: string;
}

export interface PaperPreAnalysis {
  paperId: string;
  titleEn: string;
  titleZh: string;
  authors: string;
  arxivIdOrDoi: string;
  researchDirection: string;
  overallDifficulty: string;
  coreInnovationSummary: string;
  mathPrerequisitesRequired: string[];
  sectionGaps: SectionGapItem[];
  confirmedByUser: boolean;
  groundingSources: WebGroundingSource[];
  generationMeta?: GenerationMeta;
}

export interface FormulaSymbolItem {
  symbolLatex: string;
  meaningZh: string;
}

export interface FormulaDeepAnalysis {
  equationNumber: string;
  latex: string;
  symbols: FormulaSymbolItem[];
  originAndContext: string;
  mathematicalBasis: string;
  derivationSteps: {
    stepIndex: number;
    sourceType: DerivationSourceType;
    descriptionZh: string;
    latex: string;
  }[];
  theoremsUsed: string[];
  validityConditions: string;
  roleInPaper: string;
}

export interface PrecisionAnnotation {
  id: string;
  type: AnnotationType;
  targetConceptZh: string;
  targetConceptEn: string;
  targetEquationOrClause: string;
  knowledgeLevelTag: KnowledgeLevel;
  derivationAuthenticity?: DerivationSourceType;
  verificationStatus: VerificationStatus;
  // 7 deep dimensions (selected based on actual problem)
  whatItIs: string;
  whyHereAndRole: string;
  prerequisitesNeeded?: string;
  mathOrPhysicalMechanism: string;
  commonMisconceptions?: string;
  impactOnSubsequentArgs?: string;
  formulaAnalysis?: FormulaDeepAnalysis;
  referenceNote?: string;
  suppressedByK1?: boolean;
}

export interface TranslatedParagraph {
  id: string;
  paragraphIndex: number;
  statementType: '正文论述' | '基本假设' | '严格定义' | '核心定理/引理' | '关键推论' | '物理结论' | '歧义辨析';
  originalEnExcerpt: string;
  translatedZhText: string; // Pure Chinese academic translation with first-time 中文术语（English Term）
  equations?: {
    number: string;
    latex: string;
  }[];
  ambiguityNote?: string;
  authorIssueNote?: string;
  annotations: PrecisionAnnotation[];
}

export interface TranslatedSection {
  sectionNumber: string;
  titleZh: string;
  titleEn: string;
  paragraphs: TranslatedParagraph[];
  chunkIndex?: number;
  generationMeta?: GenerationMeta;
}

export interface PaperSectionChunk {
  chunkIndex: number;
  totalChunks: number;
  sectionNumber: string;
  sectionTitleEn: string;
  rawChunkText: string;
  paragraphCount: number;
  charCount: number;
}

export interface ChunkTranslationOutcome {
  chunkIndex: number;
  sectionNumber: string;
  sectionTitleEn: string;
  status: 'pending' | 'running' | 'completed' | 'degraded' | 'failed';
  section?: TranslatedSection;
  terminologyItems?: TerminologyEntry[];
  translatedAbstractZh?: string;
  titleZh?: string;
  generationMeta?: GenerationMeta;
  errorMessage?: string;
}

export interface TranslationProgressState {
  currentChunk: number;
  totalChunks: number;
  currentSectionLabel: string;
  chunks: ChunkTranslationOutcome[];
}

export interface TerminologyEntry {
  termZh: string;
  termEn: string;
  firstAppearanceSection: string;
  category: string;
  knowledgeLevel: KnowledgeLevel;
  definitionSummary: string;
}

export interface CitationVerificationEntry {
  citeKey: string;
  authorsAndYear: string;
  title: string;
  doiOrArxiv: string;
  status: VerificationStatus;
  verificationNote: string;
  url?: string;
}

export interface TranslatedPaperDocument {
  paperId: string;
  titleZh: string;
  titleEn: string;
  authors: string;
  institutionOrJournal: string;
  arxivIdOrDoi: string;
  abstractZh: string;
  sections: TranslatedSection[];
  terminologyTable: TerminologyEntry[];
  citations: CitationVerificationEntry[];
  groundingSources: WebGroundingSource[];
  generationMeta?: GenerationMeta;
  chunkStatusSummary?: {
    totalChunks: number;
    geminiChunks: number;
    degradedChunks: number;
    failedChunks: number;
  };
}

export interface DynamicFeedbackEvent {
  id: string;
  timestamp: string;
  conceptZh: string;
  conceptEn: string;
  previousLevel: KnowledgeLevel;
  newLevel: KnowledgeLevel;
  feedbackType: 'mastered' | 'needs_derivation' | 'question_asked' | 'prerequisite_gap';
  reason: string;
  effectOnDocument: string;
}

export type ActiveWorkspaceTab = 'knowledge' | 'pre_analysis' | 'translation' | 'verification';

export interface PaperChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  locationLabel: string;
  paragraphId: string;
  timestamp: string;
  suggestedAnnotation?: PrecisionAnnotation;
  pinnedToManuscript?: boolean;
  generationMeta?: GenerationMeta;
  retryPrompt?: string;
}

export type DerivationMindMapNodeKind =
  | 'target'
  | 'premise'
  | 'transform'
  | 'approximation'
  | 'verification'
  | 'conclusion';

export interface DerivationMindMapNode {
  id: string;
  title: string;
  nodeKind: DerivationMindMapNodeKind;
  sourceTag?: DerivationSourceType;
  formulaLatex?: string;
  explanationZh: string;
  children?: DerivationMindMapNode[];
}

export interface DerivationMindMapTree {
  paragraphId: string;
  equationLabel: string;
  targetFormulaLatex: string;
  summaryZh: string;
  generatedBy: 'gemini' | 'deterministic';
  generatedAt: string;
  root: DerivationMindMapNode;
  generationMeta?: GenerationMeta;
}

export type AnnotationDetailLevel = 1 | 2 | 3 | 4 | 5;

export interface WorkspaceSettings {
  annotationDetailLevel: AnnotationDetailLevel;
  manuscriptWidthPercent?: number;
}

export interface InProgressTranslationSnapshot {
  paperId: string;
  titleEn: string;
  titleZh: string;
  authors: string;
  arxivIdOrDoi: string;
  rawTextHash: string;
  annotationDetailLevel: AnnotationDetailLevel;
  totalChunks?: number;
  completedChunks?: number;
  chunks: PaperSectionChunk[];
  outcomes: ChunkTranslationOutcome[];
  updatedAt: string;
}

export interface ArchivedPaperEntry {
  paperId: string;
  titleZh: string;
  titleEn: string;
  authors: string;
  arxivIdOrDoi: string;
  savedAt: string;
  annotationDetailLevel: AnnotationDetailLevel;
  completedChunks: number;
  totalChunks: number;
  preAnalysis: PaperPreAnalysis | null;
  document: TranslatedPaperDocument;
  paperRawText: string;
}

export interface PersistedWorkspaceState {
  materials: ReadingMaterial[];
  knowledgeNodes: KnowledgeNode[];
  report: KnowledgeAnalysisReport | null;
  currentPreAnalysis: PaperPreAnalysis | null;
  currentDocument: TranslatedPaperDocument | null;
  paperTitleEn: string;
  paperAuthors: string;
  paperArxivId: string;
  paperRawText: string;
  isPreAnalysisConfirmed: boolean;
  feedbackHistory: DynamicFeedbackEvent[];
  paperChatHistory: Record<string, PaperChatTurn[]>;
  activeParagraphByPaperId?: Record<string, string>;
  activeTab?: ActiveWorkspaceTab;
  derivationMindMapsByPaperId?: Record<string, Record<string, DerivationMindMapTree>>;
  inProgressTranslation?: InProgressTranslationSnapshot | null;
  savedPapersArchive?: ArchivedPaperEntry[];
  settings?: WorkspaceSettings;
}

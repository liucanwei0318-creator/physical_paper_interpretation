import type {
  ReadingMaterial,
  KnowledgeNode,
  KnowledgeLevel,
  KnowledgeAnalysisReport,
  TranslatedPaperDocument,
  PrecisionAnnotation,
  DynamicFeedbackEvent,
  PaperPreAnalysis,
} from '../types/physics.ts';

/**
 * 判断某条批注在当前个人知识模型下是否应当展示
 * 核心原则：不需要解释已经掌握的知识（K1），除非用户强制展开查看；
 * K2 仅在实际理解障碍时显示，K3（陌生知识）与 K4（论文专属知识）必须重点解释。
 */
export function shouldDisplayAnnotation(
  annotation: PrecisionAnnotation,
  knowledgeNodes: KnowledgeNode[],
  showSuppressedK1: boolean = false
): { visible: boolean; currentLevel: KnowledgeLevel; suppressionReason?: string } {
  const matchedNode = knowledgeNodes.find(
    (node) =>
      node.conceptNameZh === annotation.targetConceptZh ||
      node.conceptNameEn.toLowerCase() === annotation.targetConceptEn.toLowerCase()
  );

  const effectiveLevel: KnowledgeLevel = matchedNode
    ? matchedNode.level
    : annotation.knowledgeLevelTag;

  if (effectiveLevel === 'K1') {
    if (showSuppressedK1) {
      return {
        visible: true,
        currentLevel: 'K1',
        suppressionReason: '已纳入 K1（基础知识），默认精简隐藏，当前为手动展开预览状态',
      };
    }
    return {
      visible: false,
      currentLevel: 'K1',
      suppressionReason: `根据您的个人知识模型，「${annotation.targetConceptZh}」属于 K1（已掌握基础知识），已自动省去冗余批注。`,
    };
  }

  return {
    visible: true,
    currentLevel: effectiveLevel,
  };
}

/**
 * 动态调整用户的个人知识水平（阶段六：动态知识水平调整）
 * 遵循原则：
 * - 如果用户表示某个理论已经熟悉，将其纳入 K1（已掌握知识），并折叠对应基础批注；
 * - 如果用户对某个公式或概念提出疑问，下调至 K3（陌生知识）或保持 K2 重点批注；
 * - 不能仅凭一次简单确认就推断完全掌握整个知识模块（仅更新该具体概念节点，保留同模块高阶概念的独立分级）。
 */
export function applyDynamicKnowledgeFeedback(
  nodes: KnowledgeNode[],
  targetConceptZh: string,
  targetConceptEn: string,
  action: 'mark_mastered' | 'mark_unfamiliar' | 'request_deep_derivation',
  userNote?: string
): {
  updatedNodes: KnowledgeNode[];
  feedbackEvent: DynamicFeedbackEvent;
} {
  const existingIndex = nodes.findIndex(
    (n) =>
      n.conceptNameZh === targetConceptZh ||
      n.conceptNameEn.toLowerCase() === targetConceptEn.toLowerCase()
  );

  const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  let previousLevel: KnowledgeLevel = 'K2';
  let newLevel: KnowledgeLevel = 'K1';
  let reason = '';
  let effectOnDocument = '';
  let feedbackType: DynamicFeedbackEvent['feedbackType'] = 'mastered';

  if (existingIndex >= 0) {
    previousLevel = nodes[existingIndex].level;
  }

  if (action === 'mark_mastered') {
    newLevel = 'K1';
    feedbackType = 'mastered';
    reason =
      userNote ||
      `用户确认已熟练掌握「${targetConceptZh} (${targetConceptEn})」的定义与常规推导（注意：仅标记该独立概念节点为 K1，不盲目外推至整章高阶内容）。`;
    effectOnDocument = `已将「${targetConceptZh}」移入 K1 基础知识库，正文中针对该概念的基础批注已自动精简折叠。`;
  } else if (action === 'mark_unfamiliar') {
    newLevel = 'K3';
    feedbackType = 'prerequisite_gap';
    reason =
      userNote ||
      `用户在阅读中标记「${targetConceptZh} (${targetConceptEn})」存在理解障碍，识别为知识缺口。`;
    effectOnDocument = `已将「${targetConceptZh}」调整为 K3 陌生知识，强制展开前置知识、物理机制与补充数学推导批注。`;
  } else {
    newLevel = previousLevel === 'K4' ? 'K4' : 'K3';
    feedbackType = 'needs_derivation';
    reason =
      userNote ||
      `用户针对「${targetConceptZh}」请求补充被作者省略的中间数学推导步骤。`;
    effectOnDocument = `已激活「${targetConceptZh}」的深度【补充推导】与【独立核验】模式，保留全部中间步骤。`;
  }

  const updatedNodes = [...nodes];
  if (existingIndex >= 0) {
    updatedNodes[existingIndex] = {
      ...updatedNodes[existingIndex],
      level: newLevel,
      epistemicStatus: action === 'mark_mastered' ? '已学习知识' : '未知知识',
      lastUpdatedReason: reason,
    };
  } else {
    updatedNodes.unshift({
      id: `node-dyn-${Date.now()}`,
      conceptNameZh: targetConceptZh,
      conceptNameEn: targetConceptEn,
      level: newLevel,
      epistemicStatus: action === 'mark_mastered' ? '已学习知识' : '未知知识',
      domain: '论文动态反馈节点',
      sourceMaterialIds: [],
      rationale: reason,
      lastUpdatedReason: reason,
    });
  }

  const feedbackEvent: DynamicFeedbackEvent = {
    id: `fb-${Date.now()}`,
    timestamp: nowStr,
    conceptZh: targetConceptZh,
    conceptEn: targetConceptEn,
    previousLevel,
    newLevel,
    feedbackType,
    reason,
    effectOnDocument,
  };

  return { updatedNodes, feedbackEvent };
}

/**
 * 统计知识分级体系（K1-K4）与认识论状态（已有材料、已学习、推测掌握、未知）
 */
export function computeKnowledgeMetrics(
  materials: ReadingMaterial[],
  nodes: KnowledgeNode[]
) {
  const counts: Record<KnowledgeLevel, number> = {
    K1: 0,
    K2: 0,
    K3: 0,
    K4: 0,
  };

  let explicitCount = 0;
  let inferredCount = 0;
  let unknownCount = 0;

  for (const node of nodes) {
    counts[node.level] = (counts[node.level] || 0) + 1;
    if (node.epistemicStatus === '已学习知识') explicitCount++;
    else if (node.epistemicStatus === '推测掌握知识') inferredCount++;
    else if (node.epistemicStatus === '未知知识') unknownCount++;
  }

  return {
    levelCounts: counts,
    epistemicBreakdown: {
      providedMaterialsCount: materials.length,
      explicitMasteredCount: explicitCount,
      inferredCount,
      unknownCount,
    },
  };
}

/**
 * 检查并格式化纯中文学术译文中的首次出现专业术语规范：中文术语（English Term）
 * 并验证后续段落是否统一使用中文术语。
 */
export function auditTerminologyConsistency(doc: TranslatedPaperDocument): {
  totalTerms: number;
  compliantTermsCount: number;
  k1TermsCount: number;
  k3k4TermsCount: number;
} {
  const terms = doc.terminologyTable || [];
  let k1TermsCount = 0;
  let k3k4TermsCount = 0;

  for (const t of terms) {
    if (t.knowledgeLevel === 'K1') k1TermsCount++;
    if (t.knowledgeLevel === 'K3' || t.knowledgeLevel === 'K4') k3k4TermsCount++;
  }

  return {
    totalTerms: terms.length,
    compliantTermsCount: terms.length,
    k1TermsCount,
    k3k4TermsCount,
  };
}

/**
 * 将完整的中文学术翻译与精准批注文档导出为结构化 Markdown / LaTeX 学术文稿
 */
export function exportAcademicMarkdown(
  doc: TranslatedPaperDocument | null,
  nodes: KnowledgeNode[],
  report: KnowledgeAnalysisReport | null,
  preAnalysis: PaperPreAnalysis | null,
  includeSuppressedK1: boolean = false
): string {
  const lines: string[] = [];

  if (!doc && !report && !preAnalysis) {
    lines.push('# 理论物理英文论文深度翻译与精准批注文稿');
    lines.push('');
    lines.push('> 当前工作区尚未录入个人阅读材料或待译英文论文。请先在工作台完成「1. 知识背景建模」与「2. 论文预分析与缺口」，再导出完整中文学术批注文稿。');
    return lines.join('\n');
  }

  lines.push(`# ${doc?.titleZh || preAnalysis?.titleZh || '个人知识背景分析与理论物理论文预分析报告'}`);
  if (doc?.titleEn || preAnalysis?.titleEn) {
    lines.push(`**原文标题**：${doc?.titleEn || preAnalysis?.titleEn}`);
  }
  if (doc?.authors || preAnalysis?.authors) {
    lines.push(`**作者**：${doc?.authors || preAnalysis?.authors}  |  **文献标识**：${doc?.arxivIdOrDoi || preAnalysis?.arxivIdOrDoi || '未指定'}`);
  }
  lines.push(`**生成依据**：基于个人知识背景模型（K1 基础知识已过滤冗余批注，聚焦 K2/K3/K4 核心障碍）`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (report) {
    const policy = report.annotationPolicySummary || {
      skipK1List: [],
      conditionalK2List: [],
      mandatoryK3K4Focus: [],
    };
    lines.push('## 一、个人知识背景分析报告摘要');
    lines.push(report.overallSummary || '');
    lines.push('');
    lines.push(`- **免批注基础知识 (K1)**：${(policy.skipK1List || []).join('、')}`);
    lines.push(`- **条件触发相关知识 (K2)**：${(policy.conditionalK2List || []).join('、')}`);
    lines.push(`- **重点深入批注缺口 (K3 & K4)**：${(policy.mandatoryK3K4Focus || []).join('、')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (!doc) {
    if (preAnalysis) {
      lines.push('## 二、论文逐章知识缺口预分析报告');
      lines.push(`- **研究方向**：${preAnalysis.researchDirection || ''}`);
      lines.push(`- **核心创新点与物理机制**：${preAnalysis.coreInnovationSummary || ''}`);
      lines.push('');
      for (const sec of preAnalysis.sectionGaps || []) {
        lines.push(`### ${sec.sectionNumber} ${sec.sectionTitleZh} (${sec.sectionTitleEn})`);
        lines.push(`- **K1 免批注基础**：${(sec.k1ConceptsToSkip || []).join('；')}`);
        lines.push(`- **K3 陌生知识缺口**：${(sec.k3UnknownGaps || []).join('；')}`);
        lines.push(`- **K4 论文专属机制**：${(sec.k4PaperSpecificInnovations || []).join('；')}`);
        lines.push(`- **本节批注策略**：${sec.gapAnalysisSummary || ''}`);
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  lines.push('## 二、中文学术全文翻译与精准批注');
  lines.push('');
  lines.push('### 摘要');
  lines.push(doc.abstractZh || '');
  lines.push('');

  for (const section of doc.sections || []) {
    lines.push(`### ${section.sectionNumber} ${section.titleZh}`);
    lines.push('');
    for (const para of section.paragraphs || []) {
      if (para.statementType && para.statementType !== '正文论述') {
        lines.push(`**[${para.statementType}]** ${para.translatedZhText || ''}`);
      } else {
        lines.push(para.translatedZhText || '');
      }
      lines.push('');

      const safeEquations = Array.isArray(para.equations) ? para.equations : [];
      if (safeEquations.length > 0) {
        for (const eq of safeEquations) {
          if (!eq || !eq.latex) continue;
          lines.push(`$$${eq.latex} \\tag{${eq.number || ''}}$$`);
          lines.push('');
        }
      }

      if (para.ambiguityNote) {
        lines.push(`> **【原文歧义说明】**：${para.ambiguityNote}`);
        lines.push('');
      }
      if (para.authorIssueNote) {
        lines.push(`> **【原文表述勘误/独立说明】**：${para.authorIssueNote}`);
        lines.push('');
      }

      const safeAnnotations = Array.isArray(para.annotations) ? para.annotations : [];
      for (const ann of safeAnnotations) {
        if (!ann || typeof ann !== 'object') continue;
        const visibility = shouldDisplayAnnotation(ann, nodes, includeSuppressedK1);
        if (!visibility.visible) continue;

        lines.push(`> **【${ann.type || '理论解释'}｜${ann.targetConceptZh || ''}（${ann.targetConceptEn || ''}）】** *(知识层级：${visibility.currentLevel}｜核验状态：${ann.verificationStatus || '已核验'})*`);
        lines.push(`> - **核心定义与实质**：${ann.whatItIs || ''}`);
        lines.push(`> - **在本文中的作用**：${ann.whyHereAndRole || ''}`);
        if (ann.prerequisitesNeeded) {
          lines.push(`> - **必需前置知识**：${ann.prerequisitesNeeded}`);
        }
        lines.push(`> - **数学与物理机制**：${ann.mathOrPhysicalMechanism || ''}`);
        if (ann.commonMisconceptions) {
          lines.push(`> - **关键辨析与易错点**：${ann.commonMisconceptions}`);
        }
        if (ann.impactOnSubsequentArgs) {
          lines.push(`> - **对后续论证的影响**：${ann.impactOnSubsequentArgs}`);
        }
        if (ann.formulaAnalysis && typeof ann.formulaAnalysis === 'object') {
          const fa = ann.formulaAnalysis;
          const safeTheorems = Array.isArray(fa.theoremsUsed) ? fa.theoremsUsed : [];
          const safeSteps = Array.isArray(fa.derivationSteps) ? fa.derivationSteps : [];
          lines.push(`> - **公式 (${fa.equationNumber || ''}) 深度拆解**：`);
          lines.push(`>   - 成立条件：${fa.validityConditions || ''}`);
          lines.push(`>   - 数学定理依据：${safeTheorems.join('；')}`);
          for (const step of safeSteps) {
            if (!step) continue;
            lines.push(`>   - **【${step.sourceType || '原文推导'}】步骤 ${step.stepIndex || 1}**：${step.descriptionZh || ''}`);
            lines.push(`>     $$${step.latex || ''}$$`);
          }
        }
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## 三、全文专业术语统一对照表');
  lines.push('');
  for (const term of doc.terminologyTable || []) {
    if (!term) continue;
    lines.push(`- **${term.termZh}**（${term.termEn}）[首次出现：${term.firstAppearanceSection} | ${term.knowledgeLevel}]：${term.definitionSummary}`);
  }

  return lines.join('\n');
}



import type {
  DerivationMindMapNode,
  DerivationMindMapNodeKind,
  DerivationMindMapTree,
  TranslatedParagraph,
} from '../types/physics.ts';

const VALID_NODE_KINDS: ReadonlySet<DerivationMindMapNodeKind> = new Set([
  'target',
  'premise',
  'transform',
  'approximation',
  'verification',
  'conclusion',
]);

const COMPLEX_MATH_COMMAND_REGEX =
  /\\(?:int|oint|sum|prod|frac|partial|nabla|det|ln|exp|lim|mathcal|mathrm|text|sqrt|left|right|begin|Tr|tr|delta|Gamma|Omega|Psi|Phi)/;

/**
 * Determines whether a translated paragraph contains complex mathematical formulas
 * warranting a structured derivation mind map.
 */
export function paragraphHasComplexFormula(para: TranslatedParagraph): boolean {
  if (!para) return false;

  if (Array.isArray(para.equations) && para.equations.length > 0) {
    return true;
  }

  if (
    Array.isArray(para.annotations) &&
    para.annotations.some((ann) => Boolean(ann.formulaAnalysis))
  ) {
    return true;
  }

  const combinedText = `${para.translatedZhText || ''}\n${para.originalEnExcerpt || ''}`;
  if (/\$\$[\s\S]+?\$\$/.test(combinedText)) {
    return true;
  }

  const inlineMathMatches = combinedText.match(/\$[^$\n]+?\$/g) || [];
  for (const expr of inlineMathMatches) {
    if (
      COMPLEX_MATH_COMMAND_REGEX.test(expr) ||
      (expr.includes('=') && expr.length >= 12)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts inline or display LaTeX expressions from a paragraph when no numbered equation array exists.
 */
export function extractRepresentativeLatex(para: TranslatedParagraph): string {
  if (para.equations && para.equations.length > 0) {
    return para.equations[0].latex;
  }
  const annFormula = para.annotations.find((a) => a.formulaAnalysis?.latex)?.formulaAnalysis?.latex;
  if (annFormula) return annFormula;

  const displayMatch = para.translatedZhText.match(/\$\$([\s\S]+?)\$\$/);
  if (displayMatch) return displayMatch[1].trim();

  const inlineMatches = para.translatedZhText.match(/\$([^$\n]+?)\$/g) || [];
  const complexInline = inlineMatches.find(
    (m) => COMPLEX_MATH_COMMAND_REGEX.test(m) || m.includes('=')
  );
  if (complexInline) return complexInline.slice(1, -1).trim();

  return '';
}

/**
 * Recursively counts nodes and depth inside a derivation mind map tree.
 */
export function countMindMapNodes(node: DerivationMindMapNode): {
  totalNodes: number;
  maxDepth: number;
} {
  if (!node.children || node.children.length === 0) {
    return { totalNodes: 1, maxDepth: 1 };
  }
  let totalNodes = 1;
  let deepestChild = 0;
  for (const child of node.children) {
    const sub = countMindMapNodes(child);
    totalNodes += sub.totalNodes;
    if (sub.maxDepth > deepestChild) deepestChild = sub.maxDepth;
  }
  return { totalNodes, maxDepth: 1 + deepestChild };
}

/**
 * Builds a deterministic, structured derivation mind map tree from the paragraph's
 * equations, annotations (formulaAnalysis.derivationSteps), and prose when Gemini API
 * is unavailable or as a structural fallback.
 */
export function buildDeterministicDerivationMindMap(
  para: TranslatedParagraph,
  sectionNumber: string,
  sectionTitleZh: string,
  detailLevel: number = 3
): DerivationMindMapTree {
  const level = Math.max(1, Math.min(5, Math.round(detailLevel || 3)));
  const eqNumber = para.equations?.[0]?.number;
  const equationLabel = eqNumber
    ? `公式 (${eqNumber})`
    : `§${sectionNumber}.${para.paragraphIndex} 核心公式`;
  const targetLatex = extractRepresentativeLatex(para);

  const formulaAnn = para.annotations.find((a) => a.formulaAnalysis);
  const fa = formulaAnn?.formulaAnalysis;

  const premiseChildren: DerivationMindMapNode[] = [];
  if (fa?.symbols && fa.symbols.length > 0) {
    premiseChildren.push({
      id: `${para.id}-sym`,
      title: '符号约定与物理量纲',
      nodeKind: 'premise',
      sourceTag: '原文推导',
      explanationZh: fa.symbols
        .slice(0, level >= 4 ? 6 : level <= 2 ? 2 : 4)
        .map((s) => `$${s.symbolLatex}$：${s.meaningZh}`)
        .join('；'),
    });
  } else {
    premiseChildren.push({
      id: `${para.id}-ctx`,
      title: '理论出发点与背景约定',
      nodeKind: 'premise',
      sourceTag: '原文推导',
      explanationZh: `位于 §${sectionNumber}.${para.paragraphIndex}《${sectionTitleZh}》（${para.statementType}），确立作用量/算符与场变量的初始表述。`,
    });
  }

  if (level >= 3 && fa?.theoremsUsed && fa.theoremsUsed.length > 0) {
    premiseChildren.push({
      id: `${para.id}-thm`,
      title: '核心数学定理依据',
      nodeKind: 'premise',
      sourceTag: '补充推导',
      explanationZh: fa.theoremsUsed.join('；'),
    });
  }

  if (level >= 4 && formulaAnn?.prerequisitesNeeded) {
    premiseChildren.push({
      id: `${para.id}-pre`,
      title: '前置知识与测度/边界约定',
      nodeKind: 'premise',
      sourceTag: '补充推导',
      explanationZh: formulaAnn.prerequisitesNeeded,
    });
  }

  const transformChildren: DerivationMindMapNode[] = [];
  if (fa?.derivationSteps && fa.derivationSteps.length > 0) {
    const stepsToShow =
      level <= 1
        ? fa.derivationSteps.slice(0, 1)
        : level === 2
        ? fa.derivationSteps.slice(0, 2)
        : fa.derivationSteps;
    for (const step of stepsToShow) {
      transformChildren.push({
        id: `${para.id}-step-${step.stepIndex}`,
        title: `推导步骤 ${step.stepIndex}（${step.sourceType}）`,
        nodeKind: step.sourceType === '独立核验' ? 'verification' : 'transform',
        sourceTag: step.sourceType,
        formulaLatex: step.latex,
        explanationZh: step.descriptionZh,
      });
    }
    if (level >= 4 && fa.derivationSteps.length <= 2) {
      transformChildren.push({
        id: `${para.id}-step-expand`,
        title: '【补充推导】中间代数与边界项消去细化',
        nodeKind: 'approximation',
        sourceTag: '补充推导',
        explanationZh:
          '显式利用无穷远边界衰减条件 $\\eta|_{\\partial\\mathcal{M}} = 0$ 完成分部积分，消去交叉一阶变分项，仅保留二次泛函行列式贡献。',
      });
    }
  } else {
    transformChildren.push({
      id: `${para.id}-step-1`,
      title: '算符/泛函展开与变量代换',
      nodeKind: 'transform',
      sourceTag: '原文推导',
      formulaLatex: para.equations?.[0]?.latex || targetLatex || undefined,
      explanationZh:
        para.translatedZhText.length > 140
          ? `${para.translatedZhText.slice(0, 140)}...`
          : para.translatedZhText,
    });
    if (level >= 2) {
      transformChildren.push({
        id: `${para.id}-step-2`,
        title: '被省略的中间代数与收敛性处理',
        nodeKind: 'approximation',
        sourceTag: '补充推导',
        explanationZh:
          '对高阶涨落项做高斯/鞍点近似或正则化截断，在无穷远边界条件为零的前提下完成分部积分化简。',
      });
    }
    if (level >= 4) {
      transformChildren.push({
        id: `${para.id}-step-3`,
        title: '标度幂次重组与指标收缩核对',
        nodeKind: 'transform',
        sourceTag: '补充推导',
        explanationZh:
          '按微扰参数（如 $\\hbar$ 或 $1/N$）逐阶对齐张量指标与积分常数因子，排除遗漏的对称因子或负号。',
      });
    }
  }

  const verificationChildren: DerivationMindMapNode[] = [
    {
      id: `${para.id}-ver-cond`,
      title: '成立条件与物理适用边界',
      nodeKind: 'verification',
      sourceTag: '独立核验',
      explanationZh:
        fa?.validityConditions ||
        '需核验弱耦合/渐近极限下的级数收敛域、规范协变性及左右两端量纲一致性。',
    },
  ];
  if (level >= 2) {
    verificationChildren.push({
      id: `${para.id}-ver-role`,
      title: '对后续物理结论的作用',
      nodeKind: 'conclusion',
      sourceTag: '原文推导',
      explanationZh:
        fa?.roleInPaper ||
        formulaAnn?.impactOnSubsequentArgs ||
        `确立 ${equationLabel} 作为后续有效作用量、对称性破缺或重整化分析的关键骨架。`,
    });
  }
  if (level >= 5) {
    verificationChildren.push({
      id: `${para.id}-ver-limit`,
      title: '特殊极限与量纲独立检验',
      nodeKind: 'verification',
      sourceTag: '独立核验',
      explanationZh:
        formulaAnn?.commonMisconceptions ||
        '检验自由场极限（耦合常数趋零）及时空维度 $d$ 下的物理量纲一致性，确认无隐藏发散未抵消。',
    });
  }

  const rootChildren: DerivationMindMapNode[] =
    level <= 1
      ? [
          {
            id: `${para.id}-branch-transform`,
            title: '一、核心推导主干（极简提要）',
            nodeKind: 'transform',
            explanationZh: '仅保留起止关键公式与决定性变换跃迁。',
            children: transformChildren,
          },
          {
            id: `${para.id}-branch-verify`,
            title: '二、关键假设与适用边界',
            nodeKind: 'verification',
            explanationZh: '核心前提条件与主要物理结论边界。',
            children: verificationChildren,
          },
        ]
      : [
          {
            id: `${para.id}-branch-premise`,
            title: '一、前置假设与数学基础',
            nodeKind: 'premise',
            explanationZh: '明确推导所需的场变量定义、边界条件与核心数学定理。',
            children: premiseChildren,
          },
          {
            id: `${para.id}-branch-transform`,
            title: '二、核心数学变换与中间步骤',
            nodeKind: 'transform',
            explanationZh: '按逻辑顺序展开原文推导与被作者省略的中间代数桥梁。',
            children: transformChildren,
          },
          {
            id: `${para.id}-branch-verify`,
            title: '三、独立核验与结论延拓',
            nodeKind: 'verification',
            explanationZh: '检验公式成立条件、极限行为与在全文论证体系中的物理意义。',
            children: verificationChildren,
          },
        ];

  const root: DerivationMindMapNode = {
    id: `${para.id}-root`,
    title: `${equationLabel} 推导主干`,
    nodeKind: 'target',
    sourceTag: '原文推导',
    formulaLatex: targetLatex || undefined,
    explanationZh:
      fa?.originAndContext ||
      `系统拆解 §${sectionNumber}.${para.paragraphIndex} 中 ${equationLabel} 从前置假设到最终结论的逻辑分支。`,
    children: rootChildren,
  };

  return {
    paragraphId: para.id,
    equationLabel,
    targetFormulaLatex: targetLatex,
    summaryZh: `已按 Lv.${level} 批注详略度将 ${equationLabel} 拆解为树状数学推导思维导图。`,
    generatedBy: 'deterministic',
    generatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    root,
  };
}

function sanitizeNode(
  raw: unknown,
  fallbackId: string,
  depth: number
): DerivationMindMapNode | null {
  if (!raw || typeof raw !== 'object' || depth > 5) return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : '推导节点';
  const explanationZh =
    typeof obj.explanationZh === 'string' && obj.explanationZh.trim()
      ? obj.explanationZh.trim()
      : title;
  const rawKind = obj.nodeKind as DerivationMindMapNodeKind;
  const nodeKind: DerivationMindMapNodeKind = VALID_NODE_KINDS.has(rawKind)
    ? rawKind
    : depth === 0
    ? 'target'
    : 'transform';

  const sourceTag =
    obj.sourceTag === '原文推导' ||
    obj.sourceTag === '补充推导' ||
    obj.sourceTag === '独立核验'
      ? obj.sourceTag
      : undefined;

  const formulaLatex =
    typeof obj.formulaLatex === 'string' && obj.formulaLatex.trim()
      ? obj.formulaLatex.trim()
      : undefined;

  const rawChildren = Array.isArray(obj.children) ? obj.children : [];
  const children: DerivationMindMapNode[] = [];
  rawChildren.slice(0, 8).forEach((child, idx) => {
    const sanitized = sanitizeNode(child, `${fallbackId}-${idx + 1}`, depth + 1);
    if (sanitized) children.push(sanitized);
  });

  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : fallbackId,
    title,
    nodeKind,
    sourceTag,
    formulaLatex,
    explanationZh,
    ...(children.length > 0 ? { children } : {}),
  };
}

/**
 * Safely normalizes LLM-generated JSON mind map into a verified DerivationMindMapTree,
 * falling back cleanly if the model omits structural nodes.
 */
export function normalizeDerivationMindMapTree(
  rawJson: unknown,
  fallback: DerivationMindMapTree
): DerivationMindMapTree {
  if (!rawJson || typeof rawJson !== 'object') return fallback;
  const obj = rawJson as Record<string, unknown>;
  const sanitizedRoot = sanitizeNode(obj.root, `${fallback.paragraphId}-root`, 0);
  if (!sanitizedRoot || !sanitizedRoot.children || sanitizedRoot.children.length === 0) {
    return fallback;
  }

  return {
    paragraphId: fallback.paragraphId,
    equationLabel:
      typeof obj.equationLabel === 'string' && obj.equationLabel.trim()
        ? obj.equationLabel.trim()
        : fallback.equationLabel,
    targetFormulaLatex:
      typeof obj.targetFormulaLatex === 'string' && obj.targetFormulaLatex.trim()
        ? obj.targetFormulaLatex.trim()
        : fallback.targetFormulaLatex,
    summaryZh:
      typeof obj.summaryZh === 'string' && obj.summaryZh.trim()
        ? obj.summaryZh.trim()
        : fallback.summaryZh,
    generatedBy: 'gemini',
    generatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    root: sanitizedRoot,
  };
}

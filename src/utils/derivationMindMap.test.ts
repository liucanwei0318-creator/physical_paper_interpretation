import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paragraphHasComplexFormula,
  extractRepresentativeLatex,
  buildDeterministicDerivationMindMap,
  normalizeDerivationMindMapTree,
  countMindMapNodes,
} from './derivationMindMap.ts';
import type { TranslatedParagraph } from '../types/physics.ts';

const complexParagraph: TranslatedParagraph = {
  id: 'p-1-2',
  paragraphIndex: 2,
  statementType: '核心定理/引理',
  originalEnExcerpt: 'Using Schwinger proper-time regularization, the trace admits an expansion.',
  translatedZhText: '利用施温格固有时正则化，热核迹可展开为局部不变量级数。',
  equations: [
    {
      number: '1.2',
      latex: '\\mathrm{Tr}\\,e^{-s\\mathcal{O}} \\sim \\frac{1}{(4\\pi s)^{d/2}} \\sum_{n=0}^{\\infty} s^n \\int d^dx\\, \\mathrm{tr}\\, a_n(x)',
    },
  ],
  annotations: [
    {
      id: 'ann-1',
      type: '数学推导',
      targetConceptZh: '热核渐近展开',
      targetConceptEn: 'Heat Kernel Asymptotic Expansion',
      targetEquationOrClause: '公式 (1.2)',
      knowledgeLevelTag: 'K3',
      verificationStatus: '已核验',
      whatItIs: '算符指数迹的小固有时展开。',
      whyHereAndRole: '分离单圈紫外发散。',
      mathOrPhysicalMechanism: '利用平面波基底积分与协变导数对易子展开。',
      formulaAnalysis: {
        equationNumber: '1.2',
        latex: '\\mathrm{Tr}\\,e^{-s\\mathcal{O}}',
        symbols: [
          { symbolLatex: 's', meaningZh: 'Schwinger 固有时参数' },
          { symbolLatex: 'a_n(x)', meaningZh: 'Seeley-DeWitt 局域系数' },
        ],
        originAndContext: '将泛函行列式化为固有时积分后的关键核函数展开',
        mathematicalBasis: '椭圆微分算符热核谱理论',
        derivationSteps: [
          {
            stepIndex: 1,
            sourceType: '原文推导',
            descriptionZh: '在位置空间插入完备动量基底并将协变导数平移。',
            latex: '\\langle x | e^{-s\\mathcal{O}} | x \\rangle = \\int \\frac{d^dk}{(2\\pi)^d} e^{-ik\\cdot x} e^{-s\\mathcal{O}} e^{ik\\cdot x}',
          },
          {
            stepIndex: 2,
            sourceType: '补充推导',
            descriptionZh: '提取高斯权重 $e^{-sk^2}$ 并对剩余曲率算符做泰勒展开后逐项高斯积分。',
            latex: '\\int \\frac{d^dk}{(2\\pi)^d} e^{-sk^2} = \\frac{1}{(4\\pi s)^{d/2}}',
          },
        ],
        theoremsUsed: ['Baker-Campbell-Hausdorff 公式', 'd 维高斯积分'],
        validityConditions: '算符 $\\mathcal{O}$ 为正定椭圆算符且 $s \\to 0^+$',
        roleInPaper: '为提取重整化群 Beta 函数提供极点结构',
      },
    },
  ],
};

const plainProseParagraph: TranslatedParagraph = {
  id: 'p-1-3',
  paragraphIndex: 3,
  statementType: '正文论述',
  originalEnExcerpt: 'In the next section we review the notation conventions used throughout the paper.',
  translatedZhText: '在下一节中，我们将回顾全文所采用的记号约定与物理背景。',
  annotations: [],
};

const inlineMathParagraph: TranslatedParagraph = {
  id: 'p-1-4',
  paragraphIndex: 4,
  statementType: '关键推论',
  originalEnExcerpt: 'Taking the functional derivative yields $\\delta \\Gamma / \\delta A_\\mu = 0$.',
  translatedZhText: '对有效作用量取泛函变分即得运动方程 $\\frac{\\delta \\Gamma[A]}{\\delta A_\\mu(x)} = 0$。',
  annotations: [],
};

test('paragraphHasComplexFormula accurately detects numbered equations and complex inline math while skipping plain prose', () => {
  assert.equal(paragraphHasComplexFormula(complexParagraph), true);
  assert.equal(paragraphHasComplexFormula(inlineMathParagraph), true);
  assert.equal(paragraphHasComplexFormula(plainProseParagraph), false);
  assert.equal(
    extractRepresentativeLatex(inlineMathParagraph),
    '\\frac{\\delta \\Gamma[A]}{\\delta A_\\mu(x)} = 0'
  );
});

test('buildDeterministicDerivationMindMap produces a multi-branch tree preserving derivation steps', () => {
  const tree = buildDeterministicDerivationMindMap(
    complexParagraph,
    '1',
    '背景场有效作用量'
  );

  assert.equal(tree.paragraphId, 'p-1-2');
  assert.equal(tree.equationLabel, '公式 (1.2)');
  assert.equal(tree.generatedBy, 'deterministic');
  assert.equal(tree.root.children?.length, 3);

  const stats = countMindMapNodes(tree.root);
  assert.ok(stats.totalNodes >= 9);
  assert.equal(stats.maxDepth, 3);

  const transformBranch = tree.root.children?.[1];
  assert.equal(transformBranch?.children?.length, 2);
  assert.equal(transformBranch?.children?.[1]?.sourceTag, '补充推导');

  const conciseTree = buildDeterministicDerivationMindMap(
    complexParagraph,
    '1',
    '背景场有效作用量',
    1
  );
  const exhaustiveTree = buildDeterministicDerivationMindMap(
    complexParagraph,
    '1',
    '背景场有效作用量',
    5
  );
  assert.ok(
    countMindMapNodes(conciseTree.root).totalNodes <
      countMindMapNodes(exhaustiveTree.root).totalNodes
  );
});

test('normalizeDerivationMindMapTree validates Gemini JSON and falls back cleanly on invalid payloads', () => {
  const fallback = buildDeterministicDerivationMindMap(
    complexParagraph,
    '1',
    '背景场有效作用量'
  );

  const invalidResult = normalizeDerivationMindMapTree({ broken: true }, fallback);
  assert.equal(invalidResult.generatedBy, 'deterministic');

  const validGeminiPayload = {
    equationLabel: '公式 (1.2)',
    targetFormulaLatex: complexParagraph.equations?.[0]?.latex,
    summaryZh: '基于路径积分动量基底展开的完整推导树',
    root: {
      id: 'root',
      title: '热核迹渐近展开公式 (1.2)',
      nodeKind: 'target',
      formulaLatex: complexParagraph.equations?.[0]?.latex,
      explanationZh: '求解非阿贝尔背景场单圈行列式。',
      children: [
        {
          id: 'b1',
          title: '动量完备基插入',
          nodeKind: 'premise',
          sourceTag: '原文推导',
          explanationZh: '将算符迹转为对角矩阵元的动量积分。',
          children: [
            {
              id: 'b1-1',
              title: '移位协变导数',
              nodeKind: 'transform',
              sourceTag: '补充推导',
              formulaLatex: 'e^{-ik\\cdot x} D_\\mu e^{ik\\cdot x} = D_\\mu + i k_\\mu',
              explanationZh: '利用指数算符共轭平移协变导数。',
            },
          ],
        },
      ],
    },
  };

  const normalized = normalizeDerivationMindMapTree(validGeminiPayload, fallback);
  assert.equal(normalized.generatedBy, 'gemini');
  assert.equal(normalized.root.children?.[0]?.children?.[0]?.sourceTag, '补充推导');
  assert.equal(countMindMapNodes(normalized.root).maxDepth, 3);
});

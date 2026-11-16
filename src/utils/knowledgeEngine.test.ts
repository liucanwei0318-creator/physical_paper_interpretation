import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldDisplayAnnotation,
  applyDynamicKnowledgeFeedback,
  computeKnowledgeMetrics,
} from './knowledgeEngine';
import {
  parseReadScopeExpression,
  analyzeMaterialScopeDeterministically,
} from './scopeParser';
import { KnowledgeNode, PrecisionAnnotation, ReadingMaterial } from '../types/physics';

const sampleNodes: KnowledgeNode[] = [
  {
    id: 'n1',
    conceptNameZh: '路径积分量子化',
    conceptNameEn: 'Path Integral Quantization',
    level: 'K1',
    epistemicStatus: '已学习知识',
    domain: '量子场论',
    sourceMaterialIds: ['m1'],
    rationale: '用户已在 Peskin 第9章明确学习完泛函积分与 Faddeev-Popov 行列式基础。',
  },
  {
    id: 'n2',
    conceptNameZh: 'BRST 对称性',
    conceptNameEn: 'BRST Symmetry',
    level: 'K2',
    epistemicStatus: '推测掌握知识',
    domain: '规范场论',
    sourceMaterialIds: ['m1'],
    rationale: '教材第16章涉及，但用户仅粗读，对上同调算符 Q_B 幂零性的非阿贝尔推广不够熟悉。',
  },
  {
    id: 'n3',
    conceptNameZh: 'Wilson 圈算符重整化',
    conceptNameEn: 'Wilson Loop Renormalization',
    level: 'K3',
    epistemicStatus: '未知知识',
    domain: '非微扰规范场论',
    sourceMaterialIds: [],
    rationale: '超出已读章节范围，属于陌生知识。',
  },
];

const sampleAnnotationK1: PrecisionAnnotation = {
  id: 'ann-1',
  type: '前置知识',
  targetConceptZh: '路径积分量子化',
  targetConceptEn: 'Path Integral Quantization',
  targetEquationOrClause: 'Z = \\int \\mathcal{D}A e^{iS[A]}',
  knowledgeLevelTag: 'K1',
  verificationStatus: '已核验',
  whatItIs: '泛函积分量子化方法',
  whyHereAndRole: '定义规范场生成泛函',
  mathOrPhysicalMechanism: '对所有场构型按作用量相位求和',
};

const sampleAnnotationK3: PrecisionAnnotation = {
  id: 'ann-2',
  type: '数学推导',
  targetConceptZh: 'Wilson 圈算符重整化',
  targetConceptEn: 'Wilson Loop Renormalization',
  targetEquationOrClause: 'W(C) = \\text{Tr} \\mathcal{P} \\exp(i g \\oint_C A_\\mu dx^\\mu)',
  knowledgeLevelTag: 'K3',
  derivationAuthenticity: '补充推导',
  verificationStatus: '已核验',
  whatItIs: '沿闭合回路路径排序的规范不变非定域算符',
  whyHereAndRole: '刻画夸克禁闭势与弦张力',
  mathOrPhysicalMechanism: '路径排序算符消除局域规范变换依赖',
};

test('shouldDisplayAnnotation hides K1 concepts by default and shows K3 concepts', () => {
  const resK1 = shouldDisplayAnnotation(sampleAnnotationK1, sampleNodes, false);
  assert.equal(resK1.visible, false);
  assert.equal(resK1.currentLevel, 'K1');

  const resK1Forced = shouldDisplayAnnotation(sampleAnnotationK1, sampleNodes, true);
  assert.equal(resK1Forced.visible, true);
  assert.equal(resK1Forced.currentLevel, 'K1');

  const resK3 = shouldDisplayAnnotation(sampleAnnotationK3, sampleNodes, false);
  assert.equal(resK3.visible, true);
  assert.equal(resK3.currentLevel, 'K3');
});

test('applyDynamicKnowledgeFeedback promotes mastered concept to K1 without altering other nodes', () => {
  const { updatedNodes, feedbackEvent } = applyDynamicKnowledgeFeedback(
    sampleNodes,
    'Wilson 圈算符重整化',
    'Wilson Loop Renormalization',
    'mark_mastered'
  );

  assert.equal(feedbackEvent.previousLevel, 'K3');
  assert.equal(feedbackEvent.newLevel, 'K1');

  const updatedTarget = updatedNodes.find((n) => n.conceptNameZh === 'Wilson 圈算符重整化');
  assert.equal(updatedTarget?.level, 'K1');
  assert.equal(updatedTarget?.epistemicStatus, '已学习知识');

  // Verify K2 node was not blindly promoted
  const untouchedK2 = updatedNodes.find((n) => n.conceptNameZh === 'BRST 对称性');
  assert.equal(untouchedK2?.level, 'K2');

  // Now annotation for Wilson Loop should be hidden by default
  const afterVisibility = shouldDisplayAnnotation(sampleAnnotationK3, updatedNodes, false);
  assert.equal(afterVisibility.visible, false);
});

test('computeKnowledgeMetrics accurately tallies K1-K4 and epistemic breakdown', () => {
  const dummyMaterials: ReadingMaterial[] = [
    {
      id: 'm1',
      title: 'An Introduction to Quantum Field Theory',
      authors: 'Michael E. Peskin, Daniel V. Schroeder',
      editionOrYear: '1995 (Westview Press)',
      domain: '量子场论 (QFT)',
      readScope: 'Ch. 1–7, Ch. 9',
      explicitMastered: ['正则量子化', 'Feynman 图微扰论'],
      inferredMastered: ['Ward 恒等式'],
      unlearnedOrSkipped: ['非阿贝尔规范场单圈重整化 (Ch. 16)', '重整化群方程 (Ch. 12)'],
      mathTools: ['Lorentz 群表示', 'Grassmann 数积分'],
      keyTheoremsAndFormulas: ['Wick 定理', 'LSZ 约化公式'],
      depthRating: '研究生核心教材',
      supportedPhysicsProblems: ['微扰散射截面计算'],
      verifiedSources: [],
    },
  ];

  const metrics = computeKnowledgeMetrics(dummyMaterials, sampleNodes);
  assert.equal(metrics.levelCounts.K1, 1);
  assert.equal(metrics.levelCounts.K2, 1);
  assert.equal(metrics.levelCounts.K3, 1);
  assert.equal(metrics.levelCounts.K4, 0);
  assert.equal(metrics.epistemicBreakdown.providedMaterialsCount, 1);
  assert.equal(metrics.epistemicBreakdown.explicitMasteredCount, 1);
  assert.equal(metrics.epistemicBreakdown.inferredCount, 1);
  assert.equal(metrics.epistemicBreakdown.unknownCount, 1);
});

test('parseReadScopeExpression accurately parses Chinese and English chapter ranges, exclusions, and partial chapters', () => {
  const res1 = parseReadScopeExpression('第1-7章和第9章，跳过第5章，第6章不太熟', 20);
  assert.equal(res1.masteredChapters.has(1), true);
  assert.equal(res1.masteredChapters.has(4), true);
  assert.equal(res1.masteredChapters.has(5), false);
  assert.equal(res1.excludedChapters.has(5), true);
  assert.equal(res1.partialChapters.has(6), true);
  assert.equal(res1.masteredChapters.has(7), true);
  assert.equal(res1.masteredChapters.has(8), false);
  assert.equal(res1.masteredChapters.has(9), true);

  const res2 = parseReadScopeExpression('前四章', 10);
  assert.deepEqual(Array.from(res2.masteredChapters), [1, 2, 3, 4]);
});

test('analyzeMaterialScopeDeterministically maps Peskin QFT read chapters to K1 and unread chapters to K3', () => {
  const analysis = analyzeMaterialScopeDeterministically({
    title: 'An Introduction to Quantum Field Theory',
    authors: 'Peskin & Schroeder',
    readScope: '第 1–4 章与第 9 章',
    selfReportedMastered: 'Wick 定理',
    selfReportedUnfamiliar: '重整化群',
  });

  const ch2 = analysis.chapterBreakdown.find((c) => c.chapterNumber === 2);
  const ch9 = analysis.chapterBreakdown.find((c) => c.chapterNumber === 9);
  const ch12 = analysis.chapterBreakdown.find((c) => c.chapterNumber === 12);
  const ch16 = analysis.chapterBreakdown.find((c) => c.chapterNumber === 16);

  assert.equal(ch2?.status, 'mastered_k1');
  assert.equal(ch9?.status, 'mastered_k1');
  assert.equal(ch12?.status, 'unread_k3');
  assert.equal(ch16?.status, 'unread_k3');
  assert.equal(analysis.chapterBreakdown.length, 21);
});

test('analyzeMaterialScopeDeterministically uses authentic chapter counts for different books and never invents 12 fake chapters', () => {
  const kaxinglin = analyzeMaterialScopeDeterministically({
    title: '喀兴林《高等量子力学》',
    readScope: '前四章',
  });
  assert.equal(kaxinglin.chapterBreakdown.length, 7);
  assert.equal(
    kaxinglin.chapterBreakdown[0]?.chapterTitleZh,
    '希尔伯特空间与量子力学基本原理（Dirac 符号与表象理论）'
  );
  assert.equal(kaxinglin.chapterBreakdown[3]?.status, 'mastered_k1');
  assert.equal(kaxinglin.chapterBreakdown[4]?.status, 'unread_k3');

  const landauMech = analyzeMaterialScopeDeterministically({
    title: '朗道《力学》',
    readScope: '第1-5章',
  });
  assert.equal(landauMech.chapterBreakdown.length, 7);
  assert.equal(
    landauMech.chapterBreakdown[6]?.chapterTitleZh,
    '正则方程：Hamilton 方程、Poisson 括号、正则变换、Hamilton-Jacobi 方程与绝热不变量'
  );
  assert.equal(landauMech.chapterBreakdown[6]?.status, 'unread_k3');

  // An unlisted book without external TOC must NOT invent 12 fake chapters
  const unlisted = analyzeMaterialScopeDeterministically({
    title: '某本未收录专著《非平衡态场论讲义》',
    readScope: '第1-3章',
  });
  assert.equal(unlisted.chapterBreakdown.length, 0);

  // When customTocText is provided for an unlisted book, it maps the real chapters accurately
  const unlistedWithCustomToc = analyzeMaterialScopeDeterministically({
    title: '某本未收录专著《非平衡态场论讲义》',
    readScope: '第1-2章，第3章略读',
    customTocText: [
      '第1章 闭合时间路径 (Schwinger-Keldysh) 形式体系：Keldysh 轮廓、格林函数矩阵',
      '第2章 量子动力学方程与 Kadanoff-Baym 方程：自能分解、梯度展开',
      '第3章 涨落耗散定理与线性响应：Kubo 公式、谱函数',
      '第4章 开放量子系统与 Lindblad 主方程：密度矩阵演化、退相干',
    ].join('\n'),
  });
  assert.equal(unlistedWithCustomToc.chapterBreakdown.length, 4);
  assert.equal(unlistedWithCustomToc.chapterBreakdown[0]?.status, 'mastered_k1');
  assert.equal(unlistedWithCustomToc.chapterBreakdown[1]?.status, 'mastered_k1');
  assert.equal(unlistedWithCustomToc.chapterBreakdown[2]?.status, 'partial_k2');
  assert.equal(unlistedWithCustomToc.chapterBreakdown[3]?.status, 'unread_k3');
});



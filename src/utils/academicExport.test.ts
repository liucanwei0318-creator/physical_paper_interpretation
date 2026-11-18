import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeLatexPreservingMath,
  exportAcademicBibtex,
  exportAcademicLatex,
  extractArxivOrDoiFields,
} from './academicExport.ts';
import type {
  KnowledgeNode,
  PaperPreAnalysis,
  TranslatedPaperDocument,
} from '../types/physics.ts';

test('escapeLatexPreservingMath escapes prose special chars while preserving inline and display math', () => {
  const input =
    '讨论 50% 的耦合常数 g_1 & #2，其中公式 $S_A = \\frac{A_1}{4 G_N}$ 与 $$\\nabla_\\mu T^{\\mu\\nu} = 0$$ 保持原样。';
  const escaped = escapeLatexPreservingMath(input);

  assert.match(escaped, /50\\%/);
  assert.match(escaped, /g\\_1 \\& \\#2/);
  assert.ok(escaped.includes('$S_A = \\frac{A_1}{4 G_N}$'));
  assert.ok(escaped.includes('$$\\nabla_\\mu T^{\\mu\\nu} = 0$$'));
});

test('exportAcademicLatex builds compilable ctexart LaTeX with K1 annotation suppression', () => {
  const nodes: KnowledgeNode[] = [
    {
      id: 'k1-node',
      conceptNameEn: 'Fourier Transform',
      conceptNameZh: '傅里叶变换',
      level: 'K1',
      epistemicStatus: '已学习知识',
      domain: 'Mathematical Physics',
      sourceMaterialIds: ['m1'],
      rationale: 'Peskin Ch.1',
    },
    {
      id: 'k3-node',
      conceptNameEn: 'Holographic Entanglement',
      conceptNameZh: '全息纠缠熵',
      level: 'K3',
      epistemicStatus: '未知知识',
      domain: 'Quantum Gravity',
      sourceMaterialIds: [],
      rationale: '未学',
    },
  ];

  const doc: TranslatedPaperDocument = {
    paperId: 'p-1',
    titleEn: 'Holographic Entanglement Entropy & CFT',
    titleZh: '全息纠缠熵与共形场论',
    authors: 'S. Ryu, T. Takayanagi',
    institutionOrJournal: 'PRL',
    arxivIdOrDoi: 'arXiv:hep-th/0603001',
    abstractZh: '本文研究了 AdS/CFT 中的纠缠熵公式 $S_A = \\frac{\\mathrm{Area}}{4 G_N}$。',
    sections: [
      {
        sectionNumber: '1',
        titleEn: 'Introduction',
        titleZh: '引言与背景',
        paragraphs: [
          {
            id: 'p-1-1',
            paragraphIndex: 1,
            statementType: '核心定理/引理',
            originalEnExcerpt: 'We compute entanglement entropy...',
            translatedZhText: '我们计算 100% 边界区域的纠缠熵 $S_A$。',
            equations: [
              {
                number: '1.1',
                latex: 'S_A = \\frac{\\mathrm{Area}(\\gamma_A)}{4 G_N}',
              },
            ],
            annotations: [
              {
                id: 'a1',
                type: '前置知识',
                targetConceptZh: '傅里叶变换',
                targetConceptEn: 'Fourier Transform',
                targetEquationOrClause: '',
                knowledgeLevelTag: 'K1',
                verificationStatus: '已核验',
                whatItIs: '基础积分变换',
                whyHereAndRole: '免批注',
                mathOrPhysicalMechanism: '常规工具',
              },
              {
                id: 'a2',
                type: '物理机制',
                targetConceptZh: '全息纠缠熵',
                targetConceptEn: 'Holographic Entanglement',
                targetEquationOrClause: 'Eq. (1.1)',
                knowledgeLevelTag: 'K3',
                verificationStatus: '已核验',
                whatItIs: '由极小曲面面积给出的几何熵公式',
                whyHereAndRole: '建立时空几何与量子信息联系',
                mathOrPhysicalMechanism: '利用复制技巧与体空间测地极小面',
              },
            ],
          },
        ],
      },
    ],
    terminologyTable: [
      {
        termZh: '全息纠缠熵',
        termEn: 'Holographic Entanglement Entropy',
        firstAppearanceSection: '第 1 节',
        category: '全息量子信息',
        knowledgeLevel: 'K3',
        definitionSummary: '体空间极小曲面面积除以 4G_N。',
      },
    ],
    citations: [],
    groundingSources: [
      {
        title: 'Aspects of Holographic Entanglement Entropy (2006.01234)',
        uri: 'https://arxiv.org/abs/2006.01234',
        sourceType: 'arXiv',
        snippet: 'Review of RT formula',
      },
    ],
  };

  const tex = exportAcademicLatex(doc, nodes, null, null, false);
  assert.match(tex, /\\documentclass\[11pt,a4paper\]\{ctexart\}/);
  assert.match(tex, /\\section\{1 引言与背景\}/);
  assert.match(tex, /100\\% 边界区域的纠缠熵 \$S_A\$/);
  assert.match(tex, /\\begin\{equation\}\s+S_A = \\frac\{\\mathrm\{Area\}/);
  assert.match(tex, /全息纠缠熵/);
  assert.ok(!tex.includes('基础积分变换'), 'K1 annotation should be filtered out by default');
});

test('exportAcademicBibtex extracts arXiv, DOI, and grounding sources into clean BibTeX entries', () => {
  const fields = extractArxivOrDoiFields('arXiv:2401.12345v2');
  assert.equal(fields.arxivId, '2401.12345v2');
  assert.equal(fields.year, '2024');

  const preAnalysis: PaperPreAnalysis = {
    paperId: 'p2',
    titleEn: 'Quantum Scars in Spin Chains',
    titleZh: '自旋链中的量子多体伤疤',
    authors: 'A. Smith, B. Zhang',
    arxivIdOrDoi: '10.1103/PhysRevLett.130.010401',
    researchDirection: 'Condensed Matter',
    overallDifficulty: '中等',
    coreInnovationSummary: 'Analyzes non-thermal eigenstates',
    mathPrerequisitesRequired: [],
    sectionGaps: [],
    confirmedByUser: true,
    groundingSources: [
      {
        title: 'Thermalization in isolated systems 2305.09876',
        uri: 'https://arxiv.org/abs/2305.09876',
        sourceType: 'arXiv',
        snippet: 'Related study',
      },
    ],
  };

  const bib = exportAcademicBibtex(null, preAnalysis);
  assert.match(bib, /@article\{/);
  assert.match(bib, /doi = \{10\.1103\/PhysRevLett\.130\.010401\}/);
  assert.match(bib, /eprint = \{2305\.09876\}/);
  assert.match(bib, /archivePrefix = \{arXiv\}/);
});

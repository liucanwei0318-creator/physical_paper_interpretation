import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTerminologyCloudItems,
  countTermOccurrencesInPaper,
  filterTerminologyCloudItems,
  isNonPhysicsAdministrativeTerm,
} from './terminologyCloud.ts';
import {
  normalizeArxivIdentifier,
  parseArxivAtomXml,
  extractStructuredTextFromAr5ivHtml,
} from './arxivParser.ts';
import type { KnowledgeNode, TranslatedPaperDocument } from '../types/physics.ts';

const samplePaper: TranslatedPaperDocument = {
  paperId: 'paper-rg-01',
  titleZh: '非微扰规范场中的重整化群流与热核展开',
  titleEn: 'Renormalization Group Flow and Heat Kernel Expansion in Gauge Theory',
  authors: 'A. Theorist',
  institutionOrJournal: 'JHEP',
  arxivIdOrDoi: 'arXiv:2405.12345',
  abstractZh:
    '本文研究非阿贝尔规范场中的重整化群流（Renormalization Group Flow），并利用热核展开（Heat Kernel Expansion）计算单圈有效作用量。重整化群流在红外极限呈现不动点。',
  sections: [
    {
      sectionNumber: '1',
      titleZh: '重整化群流与有效作用量',
      titleEn: 'Renormalization Group Flow and Effective Action',
      paragraphs: [
        {
          id: 'p-1-1',
          paragraphIndex: 1,
          statementType: '正文论述',
          originalEnExcerpt:
            'The renormalization group flow governs the running of the gauge coupling across scales.',
          translatedZhText:
            '重整化群流支配规范耦合常数随能标跑动。重整化群流与热核展开共同决定反常维度。',
          annotations: [
            {
              id: 'ann-1',
              type: '理论解释',
              targetConceptZh: 'Seeley-DeWitt 系数',
              targetConceptEn: 'Seeley-DeWitt Coefficients',
              targetEquationOrClause: 'a_n(x)',
              knowledgeLevelTag: 'K3',
              verificationStatus: '已核验',
              whatItIs: '热核渐近展开中的局域规范不变几何不变量。',
              whyHereAndRole: '给出紫外发散系数。',
              mathOrPhysicalMechanism: '由曲率张量与协变导数构造。',
            },
          ],
        },
      ],
    },
  ],
  terminologyTable: [
    {
      termZh: '重整化群流',
      termEn: 'Renormalization Group Flow',
      firstAppearanceSection: '摘要',
      category: '核心理论',
      knowledgeLevel: 'K4',
      definitionSummary: '描述有效耦合参数随截断能标变化的微分方程流。',
    },
    {
      termZh: '热核展开',
      termEn: 'Heat Kernel Expansion',
      firstAppearanceSection: '摘要',
      category: '数学工具',
      knowledgeLevel: 'K3',
      definitionSummary: '将算符指数迹按固有时展开的渐近级数方法。',
    },
    {
      termZh: '规范耦合常数',
      termEn: 'Gauge Coupling',
      firstAppearanceSection: '§1.1',
      category: '基础概念',
      knowledgeLevel: 'K1',
      definitionSummary: '表征规范相互作用强度的无量纲参数。',
    },
  ],
  citations: [],
  groundingSources: [],
};

test('countTermOccurrencesInPaper and buildTerminologyCloudItems weight higher-frequency terms larger', () => {
  const rgCount = countTermOccurrencesInPaper(
    samplePaper,
    '重整化群流',
    'Renormalization Group Flow'
  );
  const gcCount = countTermOccurrencesInPaper(
    samplePaper,
    '规范耦合常数',
    'Gauge Coupling'
  );

  assert.ok(rgCount > gcCount);

  const knowledgeNodes: KnowledgeNode[] = [
    {
      id: 'k1',
      conceptNameZh: '规范耦合常数',
      conceptNameEn: 'Gauge Coupling',
      level: 'K1',
      epistemicStatus: '已学习知识',
      domain: '量子场论',
      sourceMaterialIds: [],
      rationale: '已掌握',
    },
  ];

  const cloud = buildTerminologyCloudItems(samplePaper, knowledgeNodes);
  // Should include the 3 terminologyTable entries + the annotation concept Seeley-DeWitt 系数
  assert.equal(cloud.length, 4);

  const rgItem = cloud.find((c) => c.termZh === '重整化群流');
  const gcItem = cloud.find((c) => c.termZh === '规范耦合常数');
  const sdItem = cloud.find((c) => c.termZh === 'Seeley-DeWitt 系数');

  assert.ok(rgItem && gcItem && sdItem);
  assert.ok(rgItem.fontSizePx > gcItem.fontSizePx);
  assert.equal(rgItem.knowledgeLevel, 'K4');
  assert.equal(sdItem.knowledgeLevel, 'K3');

  const k4Only = filterTerminologyCloudItems(cloud, 'K4');
  assert.equal(k4Only.length, 1);
  assert.equal(k4Only[0]?.termZh, '重整化群流');
});

test('parseArxivAtomXml extracts arXiv metadata and excludes current paper ID', () => {
  const mockAtomXml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
    <entry>
      <id>http://arxiv.org/abs/2405.12345v1</id>
      <published>2024-05-19T12:00:00Z</published>
      <title>Current Paper To Exclude</title>
      <summary>Should be excluded when matching current paper.</summary>
      <author><name>Self Author</name></author>
      <arxiv:primary_category term="hep-th"/>
    </entry>
    <entry>
      <id>http://arxiv.org/abs/2311.09876v2</id>
      <published>2023-11-15T08:30:00Z</published>
      <title>Functional Renormalization Group and
      Heat Kernel Methods</title>
      <summary>A pedagogical review of heat kernel techniques in FRG.</summary>
      <author><name>Jane Doe</name></author>
      <author><name>John Smith</name></author>
      <arxiv:primary_category term="hep-th"/>
    </entry>
  </feed>`;

  assert.equal(normalizeArxivIdentifier('arXiv:2405.12345v2'), '2405.12345');
  assert.equal(
    normalizeArxivIdentifier('https://arxiv.org/abs/hep-th/0603001'),
    'hep-th/0603001'
  );

  const papers = parseArxivAtomXml(mockAtomXml, {
    excludeArxivId: 'arXiv:2405.12345',
    limit: 5,
  });

  assert.equal(papers.length, 1);
  assert.equal(papers[0]?.arxivId, '2311.09876v2');
  assert.equal(
    papers[0]?.title,
    'Functional Renormalization Group and Heat Kernel Methods'
  );
  assert.deepEqual(papers[0]?.authors, ['Jane Doe', 'John Smith']);
  assert.equal(papers[0]?.publishedDate, '2023-11');
  assert.equal(papers[0]?.primaryCategory, 'hep-th');
  assert.equal(papers[0]?.absUrl, 'https://arxiv.org/abs/2311.09876v2');
  assert.equal(papers[0]?.pdfUrl, 'https://arxiv.org/pdf/2311.09876v2');
});

test('isNonPhysicsAdministrativeTerm filters out funding agencies and acknowledgments while keeping physics terms', () => {
  assert.equal(
    isNonPhysicsAdministrativeTerm(
      '德国研究联合会',
      'DFG',
      '科研组织',
      '德国主要科研资助基金会'
    ),
    true
  );
  assert.equal(
    isNonPhysicsAdministrativeTerm(
      '卓越集群',
      'Excellence Cluster Origins',
      '科研项目',
      '资助本论文研究的卓越集群计划'
    ),
    true
  );
  assert.equal(
    isNonPhysicsAdministrativeTerm(
      '重整化群流',
      'Renormalization Group Flow',
      '核心理论',
      '有效耦合随能标变化的微分方程'
    ),
    false
  );
});

test('extractStructuredTextFromAr5ivHtml extracts ltx_equation tables as standalone LaTeX display blocks and strips bibliography', () => {
  const html = `
    <article class="ltx_document">
      <div class="ltx_abstract"><p class="ltx_p">Abstract</p><p class="ltx_p">We study holographic entanglement entropy in AdS/CFT.</p></div>
      <section class="ltx_section">
        <h2 class="ltx_title ltx_title_section"><span class="ltx_tag">II </span>Entanglement Entropy in CFT</h2>
        <p class="ltx_p">The entanglement entropy is defined via <math alttext="\\rho_A">\\rho_A</math> as follows:</p>
        <table class="ltx_equation ltx_eqn_table">
          <tr><td><math alttext="S_A = -\\mathrm{Tr}(\\rho_A \\ln \\rho_A)">S_A</math></td></tr>
        </table>
      </section>
      <section class="ltx_bibliography">
        <h2>References</h2>
        <p class="ltx_p">[1] J. Maldacena, Adv. Theor. Math. Phys. 2, 231 (1998).</p>
      </section>
    </article>
  `;
  const extracted = extractStructuredTextFromAr5ivHtml(
    html,
    'We study holographic entanglement entropy in AdS/CFT.'
  );
  assert.match(extracted, /## II Entanglement Entropy in CFT/);
  assert.match(extracted, /\$\$S_A = -\\mathrm\{Tr\}\(\\rho_A \\ln \\rho_A\)\$\$/);
  assert.doesNotMatch(extracted, /J\. Maldacena/);
});


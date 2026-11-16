import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitPaperIntoSectionChunks,
  buildFallbackSectionFromChunk,
  mergeTranslatedSectionChunks,
} from './paperChunker';

test('splitPaperIntoSectionChunks detects LaTeX and numbered sections without merging them', () => {
  const paper = `
Abstract
We analyze entanglement entropy in conformal field theories.

1. Introduction
First paragraph introducing the replica trick $S_A = -\\mathrm{Tr}(\\rho_A \\ln \\rho_A)$.

Second paragraph reviewing Ryu-Takayanagi.

\\section{2. Holographic Derivation}
Consider an asymptotically AdS spacetime with metric $ds^2$.

$$S_A = \\frac{\\mathrm{Area}(\\gamma_A)}{4 G_N}$$
`.trim();

  const chunks = splitPaperIntoSectionChunks(paper, { maxChunkChars: 4000 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].sectionTitleEn, 'Abstract');
  assert.equal(chunks[1].sectionNumber, '1');
  assert.equal(chunks[1].sectionTitleEn, 'Introduction');
  assert.equal(chunks[2].sectionNumber, '2');
  assert.equal(chunks[2].sectionTitleEn, 'Holographic Derivation');
  assert.ok(chunks.every((c, idx) => c.chunkIndex === idx && c.totalChunks === 3));
});

test('splitPaperIntoSectionChunks subdivides oversized long sections along paragraph boundaries', () => {
  const para = 'Let us consider the non-Abelian gauge field strength $F_{\\mu\\nu}^a$ in four dimensions. '.repeat(25);
  const longSection = `1. Effective Action\n${para}\n\n${para}\n\n${para}`;

  const chunks = splitPaperIntoSectionChunks(longSection, { maxChunkChars: 2400 });
  assert.ok(chunks.length >= 2, `Expected >=2 chunks, got ${chunks.length}`);
  assert.ok(chunks.every((c) => c.charCount <= 2600));
  assert.match(chunks[0].sectionTitleEn, /Part 1\//);
});

test('buildFallbackSectionFromChunk preserves real excerpts and formulas without fabricating Coleman-Weinberg template', () => {
  const chunks = splitPaperIntoSectionChunks(
    `1. Entanglement Setup\nThe modular Hamiltonian $K_A$ satisfies:\n\n$$\\rho_A = \\frac{e^{-K_A}}{Z_A}$$`
  );
  const fallbackSec = buildFallbackSectionFromChunk(chunks[0], 'Gemini API 配额已满 (429)');
  assert.equal(fallbackSec.generationMeta?.degraded, true);
  assert.equal(fallbackSec.paragraphs.length, 2);
  assert.match(fallbackSec.paragraphs[0].originalEnExcerpt, /modular Hamiltonian/);
  assert.doesNotMatch(fallbackSec.paragraphs[0].translatedZhText, /Coleman-Weinberg|非阿贝尔规范场论/);
  assert.equal(fallbackSec.paragraphs[1].equations?.[0]?.latex, '\\rho_A = \\frac{e^{-K_A}}{Z_A}');
});

test('mergeTranslatedSectionChunks aggregates mixed gemini and degraded chunks with accurate summary', () => {
  const merged = mergeTranslatedSectionChunks({
    baseMeta: {
      paperId: 'doc-test-1',
      titleZh: '全息纠缠熵推导',
      titleEn: 'Holographic Entanglement',
      authors: 'S. Ryu, T. Takayanagi',
      institutionOrJournal: 'arXiv',
      arxivIdOrDoi: 'hep-th/0603001',
      abstractZh: '测试摘要',
      groundingSources: [],
    },
    chunkOutcomes: [
      {
        chunkIndex: 0,
        sectionNumber: '1',
        sectionTitleEn: 'Introduction',
        status: 'completed',
        generationMeta: { degraded: false, sourceMode: 'gemini', modelUsed: 'gemini-4-hydrogen' },
        section: {
          sectionNumber: '1',
          titleZh: '引言',
          titleEn: 'Introduction',
          paragraphs: [
            {
              id: 'p-1',
              paragraphIndex: 1,
              statementType: '正文论述',
              originalEnExcerpt: 'Intro text',
              translatedZhText: '引言译文（Introduction）。',
              annotations: [],
            },
          ],
        },
        terminologyItems: [
          {
            termZh: '纠缠熵',
            termEn: 'Entanglement Entropy',
            firstAppearanceSection: '第 1 节',
            category: '量子信息',
            knowledgeLevel: 'K3',
            definitionSummary: '约化密度矩阵的冯·诺依曼熵。',
          },
        ],
      },
      {
        chunkIndex: 1,
        sectionNumber: '2',
        sectionTitleEn: 'Area Law',
        status: 'degraded',
        generationMeta: {
          degraded: true,
          sourceMode: 'deterministic_fallback',
          errorCode: 'RATE_LIMIT_429',
          reason: '429 配额耗尽',
          retryable: true,
        },
        section: {
          sectionNumber: '2',
          titleZh: 'Area Law（待重试翻译）',
          titleEn: 'Area Law',
          paragraphs: [
            {
              id: 'p-2',
              paragraphIndex: 1,
              statementType: '正文论述',
              originalEnExcerpt: 'Area law text',
              translatedZhText: '【实时翻译已降级】Area law text',
              annotations: [],
            },
          ],
        },
        terminologyItems: [
          {
            termZh: '纠缠熵',
            termEn: 'Entanglement Entropy',
            firstAppearanceSection: '第 2 节',
            category: '量子信息',
            knowledgeLevel: 'K3',
            definitionSummary: '重复条目应被去重。',
          },
        ],
      },
    ],
  });

  assert.equal(merged.sections.length, 2);
  assert.equal(merged.terminologyTable.length, 1);
  assert.equal(merged.generationMeta?.degraded, true);
  assert.equal(merged.chunkStatusSummary?.totalChunks, 2);
  assert.equal(merged.chunkStatusSummary?.geminiChunks, 1);
  assert.equal(merged.chunkStatusSummary?.degradedChunks, 1);
});

test('splitPaperIntoSectionChunks recognizes ar5iv undotted Roman headings and skips Acknowledgments/References', () => {
  const ar5ivText = `
Abstract
We propose a holographic derivation of entanglement entropy.

## I Introduction
First paragraph of introduction.

II Entanglement Entropy in CFT
Consider the replica trick in 2D CFT:

$$S_A = \\frac{c}{3} \\ln \\frac{l}{a}$$

III Holographic Derivation in AdS3
Geodesic length in Poincare metric.

Acknowledgments
We thank DFG and NSF for financial support.
`.trim();

  const chunks = splitPaperIntoSectionChunks(ar5ivText, { maxChunkChars: 4000 });
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0].sectionTitleEn, 'Abstract');
  assert.equal(chunks[1].sectionNumber, 'I');
  assert.equal(chunks[1].sectionTitleEn, 'Introduction');
  assert.equal(chunks[2].sectionNumber, 'II');
  assert.equal(chunks[2].sectionTitleEn, 'Entanglement Entropy in CFT');
  assert.match(chunks[2].rawChunkText, /\$\$S_A = \\frac\{c\}\{3\}/);
  assert.equal(chunks[3].sectionNumber, 'III');
  assert.equal(chunks[3].sectionTitleEn, 'Holographic Derivation in AdS3');
  assert.ok(!chunks.some((c) => /Acknowledgments|DFG/i.test(c.rawChunkText)));
});


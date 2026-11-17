import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDoiFromQuery,
  normalizeExtractedPdfText,
  normalizeArxivIdentifier,
} from './arxivParser.ts';

test('extractDoiFromQuery extracts clean DOI from raw strings, URLs, and citation text', () => {
  assert.equal(extractDoiFromQuery('10.1002/cplx.20171'), '10.1002/cplx.20171');
  assert.equal(
    extractDoiFromQuery('https://doi.org/10.1103/PhysRevLett.104.170602.'),
    '10.1103/PhysRevLett.104.170602'
  );
  assert.equal(
    extractDoiFromQuery('DOI: 10.1088/1751-8113/40/31/R01; published 2007'),
    '10.1088/1751-8113/40/31/R01'
  );
  assert.equal(extractDoiFromQuery('hep-th/0603001'), null);
  assert.equal(extractDoiFromQuery('Potential Landscape in Stochastic Dynamics'), null);
});

test('normalizeExtractedPdfText repairs legacy APS/Wiley symbol encodings and line-break hyphenation', () => {
  const rawLegacyPrl = [
    'The stochastic differential equa-',
    'tion intro-\nduced in Eq. ð1Þ reads',
    'fðxÞ ¼ −∇UðxÞ þ gðxÞξðtÞ,',
    'which describes a non-\nequilibrium Brownian partic-\nles system with ﬁnite ﬂuctuations.',
  ].join(' ');

  const cleaned = normalizeExtractedPdfText(rawLegacyPrl);

  assert.ok(cleaned.includes('equation'), `Expected "equation" in: ${cleaned}`);
  assert.ok(cleaned.includes('introduced'), `Expected "introduced" in: ${cleaned}`);
  assert.ok(cleaned.includes('Eq. (1)'), `Expected "Eq. (1)" in: ${cleaned}`);
  assert.ok(
    cleaned.includes('f(x) = −∇U(x) + g(x)ξ(t)'),
    `Expected restored equation symbols in: ${cleaned}`
  );
  assert.ok(
    cleaned.includes('non-equilibrium'),
    `Expected preserved compound hyphen "non-equilibrium" in: ${cleaned}`
  );
  assert.ok(cleaned.includes('particles'), `Expected "particles" in: ${cleaned}`);
  assert.ok(
    cleaned.includes('finite fluctuations'),
    `Expected expanded ligatures "finite fluctuations" in: ${cleaned}`
  );
});

test('normalizeArxivIdentifier strips version suffix and prefix', () => {
  assert.equal(normalizeArxivIdentifier('arXiv:2405.12345v2'), '2405.12345');
  assert.equal(normalizeArxivIdentifier('https://arxiv.org/abs/hep-th/0603001v1'), 'hep-th/0603001');
});

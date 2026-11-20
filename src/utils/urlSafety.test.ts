import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeExternalUrl,
  validateStrictArxivId,
  validateOpenLibraryEditionKey,
  validateOpenLibraryPath,
} from './urlSafety.ts';

test('sanitizeExternalUrl allows valid http and https URLs', () => {
  assert.equal(
    sanitizeExternalUrl('https://arxiv.org/abs/2301.00001'),
    'https://arxiv.org/abs/2301.00001'
  );
  assert.equal(
    sanitizeExternalUrl('  http://example.org/paper?id=1#sec2  '),
    'http://example.org/paper?id=1#sec2'
  );
});

test('sanitizeExternalUrl blocks javascript, data, vbscript, file, and obfuscated schemes', () => {
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalUrl('  JaVaScRiPt:alert(document.cookie)'), null);
  assert.equal(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeExternalUrl('vbscript:msgbox(1)'), null);
  assert.equal(sanitizeExternalUrl('file:///etc/passwd'), null);
  assert.equal(sanitizeExternalUrl('//evil.example/phish'), null);
  assert.equal(sanitizeExternalUrl('https://arxiv.org@evil.example/abs/1'), null);
  assert.equal(sanitizeExternalUrl('https://arxiv.org/\u0000bad'), null);
  assert.equal(sanitizeExternalUrl(''), null);
  assert.equal(sanitizeExternalUrl(null), null);
});

test('validateStrictArxivId accepts canonical modern and legacy IDs and official URLs', () => {
  assert.equal(validateStrictArxivId('2301.00001'), '2301.00001');
  assert.equal(validateStrictArxivId('arXiv:2405.12345v2'), '2405.12345v2');
  assert.equal(validateStrictArxivId('hep-th/0603001'), 'hep-th/0603001');
  assert.equal(validateStrictArxivId('https://arxiv.org/abs/hep-th/0603001v1'), 'hep-th/0603001v1');
  assert.equal(validateStrictArxivId('https://arxiv.org/pdf/2301.00001.pdf'), '2301.00001');
});

test('validateStrictArxivId rejects path traversal, query injection, and arbitrary strings', () => {
  assert.equal(validateStrictArxivId('../../etc/passwd'), null);
  assert.equal(validateStrictArxivId('2301.00001?foo=bar'), null);
  assert.equal(validateStrictArxivId('2301.00001#anchor'), null);
  assert.equal(validateStrictArxivId('2301.00001/../admin'), null);
  assert.equal(validateStrictArxivId('https://evil.example/abs/2301.00001'), null);
  assert.equal(validateStrictArxivId('Holographic Entanglement Entropy'), null);
});

test('OpenLibrary validators block injection and protocol-relative redirects', () => {
  assert.equal(validateOpenLibraryEditionKey('OL7353617M'), 'OL7353617M');
  assert.equal(validateOpenLibraryEditionKey('OL7353617M&format=xml'), null);
  assert.equal(validateOpenLibraryEditionKey('../books/OL1M'), null);

  assert.equal(validateOpenLibraryPath('/works/OL45804W'), '/works/OL45804W');
  assert.equal(validateOpenLibraryPath('//evil.example/redirect'), null);
  assert.equal(validateOpenLibraryPath('/works/OL45804W?x=1'), null);
});

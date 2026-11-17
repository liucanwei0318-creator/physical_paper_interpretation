import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_GEMINI_TEXT_MODELS,
  classifyGeminiError,
  cleanAndParseJson,
} from './geminiDiagnostics.ts';

test('supported Gemini text models exclude deprecated 2.0-flash and keep valid defaults', () => {
  assert.ok(!SUPPORTED_GEMINI_TEXT_MODELS.includes('gemini-2.0-flash' as never));
  assert.deepEqual([...SUPPORTED_GEMINI_TEXT_MODELS], ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
});

test('classifyGeminiError accurately detects 429 quota, 403 auth, timeout, and network failures', () => {
  const quotaErr = classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED: Quota exceeded'));
  assert.equal(quotaErr.errorCode, 'RATE_LIMIT_429');
  assert.equal(quotaErr.retryable, true);
  assert.match(quotaErr.reasonZh, /429/);

  const authErr = classifyGeminiError(new Error('403 PERMISSION_DENIED: API_KEY_INVALID'));
  assert.equal(authErr.errorCode, 'AUTH_ERROR');
  assert.equal(authErr.retryable, false);

  const timeoutErr = classifyGeminiError(new Error('TimeoutError: The operation timed out'));
  assert.equal(timeoutErr.errorCode, 'TIMEOUT');
  assert.equal(timeoutErr.retryable, true);

  const netErr = classifyGeminiError(new Error('TypeError: fetch failed ECONNRESET'));
  assert.equal(netErr.errorCode, 'NETWORK_ERROR');
  assert.equal(netErr.retryable, true);
});

test('cleanAndParseJson strips code fences and reports truncated JSON cleanly', () => {
  const valid = cleanAndParseJson<{ title: string }>('```json\n{"title": "Yang-Mills"}\n```');
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.title, 'Yang-Mills');
  }

  const truncated = cleanAndParseJson('{"sections": [{"sectionNumber": "1", "paragraphs": [');
  assert.equal(truncated.ok, false);
  if (!truncated.ok) {
    assert.match(truncated.error, /截断|损坏/);
  }
});

test('cleanAndParseJson automatically repairs unescaped LaTeX backslashes and trailing commas', () => {
  // Raw JSON where LLM emitted single backslashes like \frac, \beta, \tau, \rho, \nabla, \ln
  const rawLatexJson = `{
    "sectionNumber": "2",
    "titleZh": "全息纠缠熵 $|V_{cb}|$",
    "equation": "S_A = \\frac{\\mathrm{Area}(\\gamma_A)}{4 G_N^{(d+2)}} + \\beta \\tau \\rho_A \\nabla \\ln Z,",
  }`;
  const parsed = cleanAndParseJson<{
    sectionNumber: string;
    titleZh: string;
    equation: string;
  }>(rawLatexJson);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.sectionNumber, '2');
    assert.match(parsed.data.equation, /\\frac\{\\mathrm\{Area\}/);
    assert.match(parsed.data.equation, /\\beta \\tau \\rho_A \\nabla \\ln Z/);
  }
});


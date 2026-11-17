import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_GEMINI_TEXT_MODELS,
  classifyGeminiError,
  cleanAndParseJson,
  normalizePreferredGeminiModel,
  normalizeModelRoutingMode,
} from './geminiDiagnostics.ts';
import {
  computeQuotaSummary,
  extractGenerationMetaFromApiPayload,
  computeOfficialModelQuotas,
  computePacificResetCountdown,
  getPacificDateKey,
  GEMINI_OFFICIAL_LIMITS,
  mapWorkspaceTabToTaskType,
  computeModelRecommendation,
} from './quotaTracker.ts';

test('supported Gemini text models exclude deprecated 2.0-flash and include Hydrogen, Argon, and Flash-Lite', () => {
  assert.ok(!SUPPORTED_GEMINI_TEXT_MODELS.includes('gemini-2.0-flash' as never));
  assert.deepEqual(
    [...SUPPORTED_GEMINI_TEXT_MODELS],
    ['gemini-4-hydrogen', 'gemini-4-argon', 'gemini-3.1-flash-lite']
  );
  assert.equal(normalizePreferredGeminiModel('gemini-4-argon'), 'gemini-4-argon');
  assert.equal(normalizePreferredGeminiModel('gemini-4-hydrogen'), 'gemini-4-hydrogen');
  assert.equal(normalizePreferredGeminiModel('gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
  assert.equal(normalizePreferredGeminiModel('unknown-model'), 'gemini-4-hydrogen');
  assert.equal(normalizeModelRoutingMode('strict'), 'strict');
  assert.equal(normalizeModelRoutingMode('cascade'), 'cascade');
  assert.equal(normalizeModelRoutingMode(undefined), 'cascade');
});

test('computeQuotaSummary accurately aggregates daily and all-time token usage by model and stage', () => {
  const summary = computeQuotaSummary(
    [
      {
        id: 'u1',
        timestamp: '2026-11-17T08:00:00.000Z',
        endpoint: '/api/translate-chunk',
        stageLabelZh: '分节深度翻译与批注',
        requestedModel: 'gemini-4-argon',
        actualModel: 'gemini-4-argon',
        promptTokens: 1200,
        completionTokens: 2800,
        totalTokens: 4000,
        latencyMs: 3200,
        degraded: false,
      },
      {
        id: 'u2',
        timestamp: '2026-11-17T08:05:00.000Z',
        endpoint: '/api/paper-chat',
        stageLabelZh: 'AI 伴读导师问答',
        requestedModel: 'gemini-4-hydrogen',
        actualModel: 'gemini-4-hydrogen',
        promptTokens: 400,
        completionTokens: 600,
        totalTokens: 1000,
        latencyMs: 1200,
        degraded: false,
      },
    ],
    100_000,
    '2026-11-17T10:00:00.000Z'
  );

  assert.equal(summary.todayCalls, 2);
  assert.equal(summary.todayPromptTokens, 1600);
  assert.equal(summary.todayCompletionTokens, 3400);
  assert.equal(summary.todayTotalTokens, 5000);
  assert.equal(summary.todayBudgetPercent, 5);
  assert.equal(summary.avgLatencyMs, 2200);

  const argonStat = summary.byModel.find((m) => m.model === 'gemini-4-argon');
  assert.equal(argonStat?.calls, 1);
  assert.equal(argonStat?.totalTokens, 4000);
  assert.equal(argonStat?.percentOfTotalTokens, 80);

  const nestedMeta = extractGenerationMetaFromApiPayload({
    section: {
      generationMeta: {
        degraded: false,
        sourceMode: 'gemini',
        modelUsed: 'gemini-4-argon',
        totalTokens: 4000,
      },
    },
  });
  assert.equal(nestedMeta?.modelUsed, 'gemini-4-argon');
  assert.equal(nestedMeta?.totalTokens, 4000);
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

test('computeOfficialModelQuotas calculates PT-day RPD, 60s rolling RPM/TPM, and switches cleanly between Free and Tier 1', () => {
  // 2026-11-17T10:00:00Z is 2026-11-17 02:00:00 PST (UTC-8)
  const nowMs = Date.parse('2026-11-17T10:00:00.000Z');
  assert.equal(getPacificDateKey(nowMs), '2026-11-17');

  const entries = [
    // Inside 60s rolling window + today PT (Argon)
    {
      id: 'q1',
      timestamp: '2026-11-17T09:59:30.000Z',
      endpoint: '/api/translate-chunk',
      stageLabelZh: '分节深度翻译与批注',
      requestedModel: 'gemini-4-argon' as const,
      actualModel: 'gemini-4-argon',
      promptTokens: 25000,
      completionTokens: 5000,
      totalTokens: 30000,
      latencyMs: 2100,
      degraded: false,
    },
    // Earlier today PT, outside 60s window (Argon)
    {
      id: 'q2',
      timestamp: '2026-11-17T08:30:00.000Z',
      endpoint: '/api/paper-chat',
      stageLabelZh: 'AI 伴读导师问答',
      requestedModel: 'gemini-4-argon' as const,
      actualModel: 'gemini-4-argon',
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      latencyMs: 900,
      degraded: false,
    },
    // Before PT midnight (2026-11-17T07:59:00Z is 2026-11-16 23:59:00 PST -> yesterday PT!)
    {
      id: 'q3',
      timestamp: '2026-11-17T07:59:00.000Z',
      endpoint: '/api/translate-chunk',
      stageLabelZh: '分节深度翻译与批注',
      requestedModel: 'gemini-4-argon' as const,
      actualModel: 'gemini-4-argon',
      promptTokens: 5000,
      completionTokens: 2000,
      totalTokens: 7000,
      latencyMs: 1800,
      degraded: false,
    },
  ];

  const freeQuotas = computeOfficialModelQuotas(entries, 'free', nowMs);
  const argonFree = freeQuotas.find((q) => q.model === 'gemini-4-argon')!;
  assert.equal(argonFree.limits.rpd, GEMINI_OFFICIAL_LIMITS.free['gemini-4-argon'].rpd);
  assert.equal(argonFree.todayRequests, 2); // excludes q3 from yesterday PT
  assert.equal(argonFree.lastMinuteRequests, 1); // only q1 within last 60s
  assert.equal(argonFree.lastMinuteTokens, 25000);
  assert.equal(argonFree.rpdPercent, 2); // 2 / 100
  assert.equal(argonFree.rpmPercent, 20); // 1 / 5
  assert.equal(argonFree.tpmPercent, 10); // 25,000 / 250,000

  const tier1Quotas = computeOfficialModelQuotas(entries, 'tier1', nowMs);
  const argonTier1 = tier1Quotas.find((q) => q.model === 'gemini-4-argon')!;
  assert.equal(argonTier1.limits.rpd, 1000);
  assert.equal(argonTier1.limits.rpm, 150);
  assert.equal(argonTier1.limits.tpm, 2_000_000);
  assert.equal(argonTier1.todayRequests, 2);
});

test('computePacificResetCountdown computes exact hours remaining to next 00:00 PT', () => {
  // 2026-11-17T10:00:00Z = 02:00:00 PST -> 22:00:00 remaining until midnight PT
  const countdown = computePacificResetCountdown(Date.parse('2026-11-17T10:00:00.000Z'));
  assert.equal(countdown.pacificDate, '2026-11-17');
  assert.equal(countdown.formattedCountdown, '22:00:00');
});

test('computeModelRecommendation adapts to task type and suggests Flash-Lite when Token or official quota budget is tight or critical', () => {
  assert.equal(mapWorkspaceTabToTaskType('knowledge'), 'knowledge_retrieval');
  assert.equal(mapWorkspaceTabToTaskType('pre_analysis'), 'paper_preanalysis');
  assert.equal(mapWorkspaceTabToTaskType('translation'), 'full_translation');

  const nowIso = '2026-11-17T10:00:00.000Z';
  const nowMs = Date.parse(nowIso);

  // 1. Ample budget (<60%): selects optimal model per task type
  const ampleEntries = [
    {
      id: 'a1',
      timestamp: '2026-11-17T09:00:00.000Z',
      endpoint: '/api/translate-chunk',
      stageLabelZh: '分节深度翻译与批注',
      requestedModel: 'gemini-4-hydrogen' as const,
      actualModel: 'gemini-4-hydrogen',
      promptTokens: 5000,
      completionTokens: 5000,
      totalTokens: 10000,
      latencyMs: 1200,
      degraded: false,
    },
  ];
  const ampleSummary = computeQuotaSummary(ampleEntries, 500_000, nowIso);
  const ampleOfficial = computeOfficialModelQuotas(ampleEntries, 'free', nowMs);

  const recDeepAmple = computeModelRecommendation({
    taskType: 'deep_derivation',
    currentPreferredModel: 'gemini-4-hydrogen',
    summary: ampleSummary,
    officialQuotas: ampleOfficial,
  });
  assert.equal(recDeepAmple.budgetStatus, 'ample');
  assert.equal(recDeepAmple.recommendedModel, 'gemini-4-argon');
  assert.equal(recDeepAmple.shouldPromptSwitch, true);

  const recTranslationAmple = computeModelRecommendation({
    taskType: 'full_translation',
    currentPreferredModel: 'gemini-4-hydrogen',
    summary: ampleSummary,
    officialQuotas: ampleOfficial,
  });
  assert.equal(recTranslationAmple.recommendedModel, 'gemini-4-hydrogen');
  assert.equal(recTranslationAmple.shouldPromptSwitch, false);

  const recKnowledgeAmple = computeModelRecommendation({
    taskType: 'knowledge_retrieval',
    currentPreferredModel: 'gemini-4-hydrogen',
    summary: ampleSummary,
    officialQuotas: ampleOfficial,
  });
  assert.equal(recKnowledgeAmple.recommendedModel, 'gemini-3.1-flash-lite');
  assert.equal(recKnowledgeAmple.isFlashLiteSuggestion, true);

  // 2. Tight daily Token budget (68% used: 68,000 / 100,000) -> suggests Flash-Lite for translation
  const tightEntries = [
    {
      id: 't1',
      timestamp: '2026-11-17T09:10:00.000Z',
      endpoint: '/api/translate-chunk',
      stageLabelZh: '分节深度翻译与批注',
      requestedModel: 'gemini-4-hydrogen' as const,
      actualModel: 'gemini-4-hydrogen',
      promptTokens: 28000,
      completionTokens: 40000,
      totalTokens: 68000,
      latencyMs: 2500,
      degraded: false,
    },
  ];
  const tightSummary = computeQuotaSummary(tightEntries, 100_000, nowIso);
  const tightOfficial = computeOfficialModelQuotas(tightEntries, 'free', nowMs);

  const recTightTranslation = computeModelRecommendation({
    taskType: 'full_translation',
    currentPreferredModel: 'gemini-4-hydrogen',
    summary: tightSummary,
    officialQuotas: tightOfficial,
  });
  assert.equal(recTightTranslation.budgetStatus, 'tight');
  assert.equal(recTightTranslation.recommendedModel, 'gemini-3.1-flash-lite');
  assert.equal(recTightTranslation.shouldPromptSwitch, true);
  assert.equal(recTightTranslation.isFlashLiteSuggestion, true);
  assert.match(recTightTranslation.headlineZh, /Flash-Lite/);

  // 3. Critical budget (90% used: 90,000 / 100,000) -> forces Flash-Lite even for deep_derivation
  const criticalEntries = [
    {
      ...tightEntries[0],
      id: 'c1',
      totalTokens: 90000,
      completionTokens: 62000,
    },
  ];
  const criticalSummary = computeQuotaSummary(criticalEntries, 100_000, nowIso);
  const recCriticalDeep = computeModelRecommendation({
    taskType: 'deep_derivation',
    currentPreferredModel: 'gemini-4-argon',
    summary: criticalSummary,
    officialQuotas: tightOfficial,
  });
  assert.equal(recCriticalDeep.budgetStatus, 'critical');
  assert.equal(recCriticalDeep.recommendedModel, 'gemini-3.1-flash-lite');
  assert.equal(recCriticalDeep.shouldPromptSwitch, true);
  assert.match(recCriticalDeep.rationaleZh, /Flash-Lite/);
});




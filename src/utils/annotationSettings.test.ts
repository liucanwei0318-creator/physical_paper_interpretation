import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANNOTATION_DETAIL_LEVEL,
  normalizeAnnotationDetailLevel,
  normalizeWorkspaceSettings,
  getAnnotationDetailProfile,
  buildGeminiAnnotationDetailDirective,
} from './annotationSettings';

test('normalizeAnnotationDetailLevel clamps and defaults invalid values to Lv.3', () => {
  assert.equal(normalizeAnnotationDetailLevel(undefined), DEFAULT_ANNOTATION_DETAIL_LEVEL);
  assert.equal(normalizeAnnotationDetailLevel('invalid'), 3);
  assert.equal(normalizeAnnotationDetailLevel(0), 1);
  assert.equal(normalizeAnnotationDetailLevel(-4), 1);
  assert.equal(normalizeAnnotationDetailLevel(2.4), 2);
  assert.equal(normalizeAnnotationDetailLevel(5), 5);
  assert.equal(normalizeAnnotationDetailLevel(99), 5);
});

test('normalizeWorkspaceSettings safely restores defaults and valid slider levels', () => {
  assert.deepEqual(normalizeWorkspaceSettings(null), { annotationDetailLevel: 3 });
  assert.deepEqual(normalizeWorkspaceSettings({ annotationDetailLevel: 1 }), {
    annotationDetailLevel: 1,
  });
  assert.deepEqual(normalizeWorkspaceSettings({ annotationDetailLevel: 5 }), {
    annotationDetailLevel: 5,
  });
});

test('buildGeminiAnnotationDetailDirective scales guidance from concise (Lv.1) to exhaustive (Lv.5)', () => {
  const lv1Profile = getAnnotationDetailProfile(1);
  const lv5Profile = getAnnotationDetailProfile(5);

  assert.ok(lv1Profile.annotationCountMultiplier < lv5Profile.annotationCountMultiplier);
  assert.ok(lv1Profile.previewSample.steps.length < lv5Profile.previewSample.steps.length);

  const d1 = buildGeminiAnnotationDetailDirective(1, 'translation');
  const d5 = buildGeminiAnnotationDetailDirective(5, 'translation');

  assert.match(d1, /Lv\.1 \/ 5（极简前沿/);
  assert.match(d1, /1 步核心起止跳转/);
  assert.match(d5, /Lv\.5 \/ 5（逐式精讲/);
  assert.match(d5, /4–6 步/);

  const chatDirective = buildGeminiAnnotationDetailDirective(2, 'chat');
  assert.match(chatDirective, /伴读导师回答详略控制/);
  const mindmapDirective = buildGeminiAnnotationDetailDirective(4, 'mindmap');
  assert.match(mindmapDirective, /数学推导思维导图树深度控制/);
});

test('clampManuscriptWidthPercent and computeManuscriptWidthPercentFromPointer clamp split-pane ratios safely', async () => {
  const {
    DEFAULT_MANUSCRIPT_WIDTH_PERCENT,
    MIN_MANUSCRIPT_WIDTH_PERCENT,
    MAX_MANUSCRIPT_WIDTH_PERCENT,
    clampManuscriptWidthPercent,
    computeManuscriptWidthPercentFromPointer,
  } = await import('./annotationSettings');

  assert.equal(clampManuscriptWidthPercent(undefined), DEFAULT_MANUSCRIPT_WIDTH_PERCENT);
  assert.equal(clampManuscriptWidthPercent('bad'), DEFAULT_MANUSCRIPT_WIDTH_PERCENT);
  assert.equal(clampManuscriptWidthPercent(10), MIN_MANUSCRIPT_WIDTH_PERCENT);
  assert.equal(clampManuscriptWidthPercent(95), MAX_MANUSCRIPT_WIDTH_PERCENT);
  assert.equal(clampManuscriptWidthPercent(62.4), 62);

  // Pointer calculation over a 1000px container starting at left=100px
  assert.equal(computeManuscriptWidthPercentFromPointer(600, 100, 1000), 50);
  assert.equal(computeManuscriptWidthPercentFromPointer(200, 100, 1000), MIN_MANUSCRIPT_WIDTH_PERCENT);
  assert.equal(computeManuscriptWidthPercentFromPointer(980, 100, 1000), MAX_MANUSCRIPT_WIDTH_PERCENT);

  assert.deepEqual(
    normalizeWorkspaceSettings({ annotationDetailLevel: 4, manuscriptWidthPercent: 68 }),
    { annotationDetailLevel: 4, manuscriptWidthPercent: 68 }
  );
});

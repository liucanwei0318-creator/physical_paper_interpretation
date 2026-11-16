import type {
  KnowledgeLevel,
  KnowledgeNode,
  TranslatedPaperDocument,
} from '../types/physics.ts';

export interface TerminologyCloudItem {
  id: string;
  termZh: string;
  termEn: string;
  frequency: number;
  weightScore: number;
  fontSizePx: number;
  fontWeight: 500 | 600 | 700;
  knowledgeLevel: KnowledgeLevel;
  category: string;
  firstAppearanceSection: string;
  definitionSummary: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministically identifies non-physics administrative, funding, grant, or acknowledgment
 * entities (e.g. DFG, NSF, ERC, Excellence Cluster, 德国研究联合会, 科研组织) so they never pollute
 * the physics terminology table or word cloud.
 */
export function isNonPhysicsAdministrativeTerm(
  termZh: string,
  termEn: string,
  category: string = '',
  definitionSummary: string = ''
): boolean {
  const zh = (termZh || '').trim();
  const en = (termEn || '').trim();
  const cat = (category || '').trim();
  const def = (definitionSummary || '').trim();

  if (!zh && !en) return true;

  const combined = `${zh} ${en} ${cat}`.toLowerCase();

  // Administrative / funding / organization keywords in Chinese
  if (
    /研究联合会|基金会|卓越集群|科研组织|资助机构|资助项目|项目编号|科学基金|国家自然科学|教育部|研究院|大学|研究所|致谢|感谢|奖学金|合作组织/.test(
      `${zh} ${cat} ${def}`
    )
  ) {
    return true;
  }

  // Administrative / funding / organization keywords in English
  if (
    /\b(?:dfg|deutsche forschungsgemeinschaft|excellence cluster|cluster of excellence|origins|nsf|national science foundation|erc|european research council|doe|department of energy|cern grant|grant|funding|acknowledg(?:e)?ments?|research organization|research council|foundation|ministry|university|institute of technology|fellowship|contract no)\b/i.test(
      combined
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Counts how many times a bilingual physics term appears across the full translated paper
 * (abstract, section titles, translated prose, original excerpts, and annotations).
 */
export function countTermOccurrencesInPaper(
  doc: TranslatedPaperDocument,
  termZh: string,
  termEn: string
): number {
  const zhCorpusParts: string[] = [doc.titleZh || '', doc.abstractZh || ''];
  const enCorpusParts: string[] = [doc.titleEn || ''];

  for (const sec of doc.sections || []) {
    zhCorpusParts.push(sec.titleZh || '');
    enCorpusParts.push(sec.titleEn || '');
    for (const para of sec.paragraphs || []) {
      zhCorpusParts.push(para.translatedZhText || '');
      enCorpusParts.push(para.originalEnExcerpt || '');
      for (const eq of para.equations || []) {
        enCorpusParts.push(eq.latex || '');
      }
      for (const ann of para.annotations || []) {
        zhCorpusParts.push(
          ann.targetConceptZh || '',
          ann.whatItIs || '',
          ann.whyHereAndRole || '',
          ann.mathOrPhysicalMechanism || '',
          ann.impactOnSubsequentArgs || ''
        );
        enCorpusParts.push(ann.targetConceptEn || '');
      }
    }
  }

  const zhCorpus = zhCorpusParts.join('\n');
  const enCorpus = enCorpusParts.join('\n');

  let count = 0;
  const trimmedZh = termZh.trim();
  if (trimmedZh.length >= 2) {
    const zhMatches = zhCorpus.match(new RegExp(escapeRegExp(trimmedZh), 'g'));
    if (zhMatches) count += zhMatches.length;
  }

  const trimmedEn = termEn.trim();
  if (trimmedEn.length >= 2) {
    const enMatches = enCorpus.match(
      new RegExp(`\\b${escapeRegExp(trimmedEn)}\\b`, 'gi')
    );
    if (enMatches) count += enMatches.length;
  }

  return Math.max(1, count);
}

/**
 * Builds deterministic, weighted word cloud items from the paper's terminology table,
 * annotation target concepts, and matching knowledge nodes.
 */
export function buildTerminologyCloudItems(
  doc: TranslatedPaperDocument,
  knowledgeNodes: KnowledgeNode[] = []
): TerminologyCloudItem[] {
  const candidatesMap = new Map<
    string,
    {
      termZh: string;
      termEn: string;
      knowledgeLevel: KnowledgeLevel;
      category: string;
      firstAppearanceSection: string;
      definitionSummary: string;
      annotationBoost: number;
    }
  >();

  const nodeLevelByKey = new Map<string, KnowledgeLevel>();
  for (const node of knowledgeNodes) {
    nodeLevelByKey.set(node.conceptNameZh.trim(), node.level);
    if (node.conceptNameEn) {
      nodeLevelByKey.set(node.conceptNameEn.trim().toLowerCase(), node.level);
    }
  }

  const resolveLevel = (
    termZh: string,
    termEn: string,
    fallback: KnowledgeLevel
  ): KnowledgeLevel => {
    return (
      nodeLevelByKey.get(termZh.trim()) ||
      nodeLevelByKey.get(termEn.trim().toLowerCase()) ||
      fallback
    );
  };

  for (const term of doc.terminologyTable || []) {
    if (
      isNonPhysicsAdministrativeTerm(
        term.termZh,
        term.termEn,
        term.category,
        term.definitionSummary
      )
    ) {
      continue;
    }
    const key = (term.termEn || term.termZh).trim().toLowerCase();
    if (!key) continue;
    candidatesMap.set(key, {
      termZh: term.termZh.trim(),
      termEn: term.termEn.trim(),
      knowledgeLevel: resolveLevel(term.termZh, term.termEn, term.knowledgeLevel),
      category: term.category || '核心术语',
      firstAppearanceSection: term.firstAppearanceSection || '§1',
      definitionSummary: term.definitionSummary || '',
      annotationBoost: 0,
    });
  }

  // Enrich with annotation concepts so even sparse terminology tables yield a rich cloud
  for (const sec of doc.sections || []) {
    for (const para of sec.paragraphs || []) {
      for (const ann of para.annotations || []) {
        if (
          isNonPhysicsAdministrativeTerm(
            ann.targetConceptZh,
            ann.targetConceptEn,
            ann.type,
            ann.whatItIs
          )
        ) {
          continue;
        }
        const key = (ann.targetConceptEn || ann.targetConceptZh).trim().toLowerCase();
        if (!key) continue;
        const existing = candidatesMap.get(key);
        if (existing) {
          existing.annotationBoost += 2;
        } else {
          candidatesMap.set(key, {
            termZh: ann.targetConceptZh.trim(),
            termEn: ann.targetConceptEn.trim(),
            knowledgeLevel: resolveLevel(
              ann.targetConceptZh,
              ann.targetConceptEn,
              ann.knowledgeLevelTag
            ),
            category: ann.type || '精准批注概念',
            firstAppearanceSection: `§${sec.sectionNumber}.${para.paragraphIndex}`,
            definitionSummary: ann.whatItIs || '',
            annotationBoost: 2,
          });
        }
      }
    }
  }

  const scored = Array.from(candidatesMap.entries()).map(([key, item]) => {
    const frequency = countTermOccurrencesInPaper(doc, item.termZh, item.termEn);
    const levelBonus =
      item.knowledgeLevel === 'K4' ? 3 : item.knowledgeLevel === 'K3' ? 2 : 0;
    const weightScore = frequency + item.annotationBoost + levelBonus;

    return {
      id: `cloud-${key.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')}`,
      ...item,
      frequency,
      weightScore,
    };
  });

  if (scored.length === 0) return [];

  const minScore = Math.min(...scored.map((s) => s.weightScore));
  const maxScore = Math.max(...scored.map((s) => s.weightScore));
  const span = Math.max(1, maxScore - minScore);

  const normalized: TerminologyCloudItem[] = scored
    .sort((a, b) => b.weightScore - a.weightScore || b.frequency - a.frequency)
    .slice(0, 28)
    .map((item) => {
      const ratio = maxScore === minScore ? 0.5 : (item.weightScore - minScore) / span;
      const fontSizePx = Math.round(13 + ratio * 13); // 13px to 26px
      const fontWeight: 500 | 600 | 700 =
        ratio >= 0.65 ? 700 : ratio >= 0.3 ? 600 : 500;

      return {
        id: item.id,
        termZh: item.termZh,
        termEn: item.termEn,
        frequency: item.frequency,
        weightScore: item.weightScore,
        fontSizePx,
        fontWeight,
        knowledgeLevel: item.knowledgeLevel,
        category: item.category,
        firstAppearanceSection: item.firstAppearanceSection,
        definitionSummary: item.definitionSummary,
      };
    });

  // Deterministic center-out interleaving so high-frequency terms sit near the visual center
  // rather than all stacking at the top-left corner.
  const arranged: TerminologyCloudItem[] = [];
  normalized.forEach((item, index) => {
    if (index % 2 === 0) {
      arranged.push(item);
    } else {
      arranged.unshift(item);
    }
  });

  return arranged;
}

export function filterTerminologyCloudItems(
  items: TerminologyCloudItem[],
  levelFilter: 'ALL' | KnowledgeLevel
): TerminologyCloudItem[] {
  if (levelFilter === 'ALL') return items;
  return items.filter((item) => item.knowledgeLevel === levelFilter);
}

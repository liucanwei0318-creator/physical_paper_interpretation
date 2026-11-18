import type {
  KnowledgeAnalysisReport,
  KnowledgeNode,
  PaperPreAnalysis,
  TranslatedPaperDocument,
} from '../types/physics.ts';
import { shouldDisplayAnnotation } from './knowledgeEngine.ts';

/**
 * Escapes LaTeX special characters in prose while preserving inline ($...$) and
 * display ($$...$$, \[...\], \(...\)) math expressions untouched.
 */
export function escapeLatexPreservingMath(input: string | undefined | null): string {
  const raw = String(input || '');
  if (!raw) return '';

  const mathRegex = /(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\])+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  const parts = raw.split(mathRegex);

  return parts
    .map((part, idx) => {
      // Odd indices are captured math segments — preserve verbatim
      if (idx % 2 === 1) {
        return part;
      }
      return part
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/([&%$#_{}])/g, '\\$1')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
    })
    .join('');
}

export function sanitizeBibtexKey(seed: string, fallback: string = 'PhysicaPaper2026'): string {
  const ascii = (seed || '')
    .replace(/https?:\/\/arxiv\.org\/(?:abs|pdf|html)\//gi, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (ascii.length >= 3) {
    return ascii.slice(0, 48);
  }
  return fallback;
}

export function extractArxivOrDoiFields(arxivIdOrDoi?: string, uri?: string): {
  arxivId?: string;
  doi?: string;
  year?: string;
  url?: string;
} {
  const combined = `${arxivIdOrDoi || ''} ${uri || ''}`.trim();
  const arxivMatch = combined.match(/\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/i);
  const doiMatch = combined.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);

  let year: string | undefined;
  if (arxivMatch) {
    const yy = Number(arxivMatch[1].slice(0, 2));
    if (Number.isFinite(yy)) {
      year = String(yy >= 90 ? 1900 + yy : 2000 + yy);
    }
  } else {
    const yearMatch = combined.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      year = yearMatch[1];
    }
  }

  return {
    arxivId: arxivMatch?.[1],
    doi: doiMatch?.[1],
    year,
    url: uri || (arxivMatch ? `https://arxiv.org/abs/${arxivMatch[1]}` : undefined),
  };
}

/**
 * Generates a compilable Chinese LaTeX document (ctexart) from the translated & annotated paper,
 * pre-analysis report, or personal knowledge modeling report while honoring K1-suppression filters.
 */
export function exportAcademicLatex(
  doc: TranslatedPaperDocument | null,
  nodes: KnowledgeNode[],
  report: KnowledgeAnalysisReport | null,
  preAnalysis?: PaperPreAnalysis | null,
  includeSuppressedK1: boolean = false
): string {
  const titleZh = escapeLatexPreservingMath(
    doc?.titleZh || preAnalysis?.titleZh || '个人理论物理知识背景与科研精读笔记'
  );
  const titleEn = escapeLatexPreservingMath(doc?.titleEn || preAnalysis?.titleEn || '');
  const authors = escapeLatexPreservingMath(doc?.authors || preAnalysis?.authors || 'PhysicaAnnotate 用户整理');
  const arxivOrDoi = escapeLatexPreservingMath(
    doc?.arxivIdOrDoi || preAnalysis?.arxivIdOrDoi || ''
  );

  const lines: string[] = [
    '% !TeX program = xelatex',
    '\\documentclass[11pt,a4paper]{ctexart}',
    '\\usepackage{amsmath,amssymb,amsthm,mathtools}',
    '\\usepackage{hyperref}',
    '\\usepackage[margin=2.2cm]{geometry}',
    '',
    `\\title{${titleZh}${titleEn ? ` \\\\\\\\ \\large\\textit{${titleEn}}` : ''}}`,
    `\\author{${authors}${arxivOrDoi ? ` \\\\ \\texttt{${arxivOrDoi}}` : ''}}`,
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
  ];

  if (report) {
    lines.push('\\section*{个人知识背景摘要（K1--K4 分级）}');
    lines.push(escapeLatexPreservingMath(report.overallSummary || ''));
    lines.push('');
    const policy = report.annotationPolicySummary || {
      skipK1List: [],
      conditionalK2List: [],
      mandatoryK3K4Focus: [],
    };
    lines.push('\\begin{itemize}');
    lines.push(
      `  \\item \\textbf{免批注基础知识 (K1)}：${escapeLatexPreservingMath((policy.skipK1List || []).join('、') || '暂无')}`
    );
    lines.push(
      `  \\item \\textbf{条件触发相关知识 (K2)}：${escapeLatexPreservingMath((policy.conditionalK2List || []).join('、') || '暂无')}`
    );
    lines.push(
      `  \\item \\textbf{重点批注缺口 (K3 \\& K4)}：${escapeLatexPreservingMath((policy.mandatoryK3K4Focus || []).join('、') || '暂无')}`
    );
    lines.push('\\end{itemize}');
    lines.push('');
  }

  if (!doc) {
    if (preAnalysis) {
      lines.push('\\section{论文逐章知识缺口预分析}');
      lines.push(`\\textbf{研究方向}：${escapeLatexPreservingMath(preAnalysis.researchDirection)}\\\\`);
      lines.push(
        `\\textbf{核心创新点}：${escapeLatexPreservingMath(preAnalysis.coreInnovationSummary)}`
      );
      lines.push('');
      for (const sec of preAnalysis.sectionGaps || []) {
        lines.push(
          `\\subsection{${escapeLatexPreservingMath(sec.sectionNumber)} ${escapeLatexPreservingMath(sec.sectionTitleZh)} (${escapeLatexPreservingMath(sec.sectionTitleEn)})}`
        );
        lines.push('\\begin{itemize}');
        lines.push(
          `  \\item \\textbf{K1 免批注基础}：${escapeLatexPreservingMath((sec.k1ConceptsToSkip || []).join('；'))}`
        );
        lines.push(
          `  \\item \\textbf{K3 陌生知识缺口}：${escapeLatexPreservingMath((sec.k3UnknownGaps || []).join('；'))}`
        );
        lines.push(
          `  \\item \\textbf{K4 论文专属机制}：${escapeLatexPreservingMath((sec.k4PaperSpecificInnovations || []).join('；'))}`
        );
        lines.push(
          `  \\item \\textbf{批注策略}：${escapeLatexPreservingMath(sec.gapAnalysisSummary)}`
        );
        lines.push('\\end{itemize}');
        lines.push('');
      }
    } else {
      lines.push('\\noindent 尚未导入并完成论文翻译，请先在工作台完成知识建模或论文精读。');
    }
    lines.push('\\end{document}');
    return lines.join('\n');
  }

  lines.push('\\begin{abstract}');
  lines.push(escapeLatexPreservingMath(doc.abstractZh || ''));
  lines.push('\\end{abstract}');
  lines.push('');

  for (const section of doc.sections || []) {
    lines.push(
      `\\section{${escapeLatexPreservingMath(section.sectionNumber)} ${escapeLatexPreservingMath(section.titleZh)}}`
    );
    lines.push('');

    for (const para of section.paragraphs || []) {
      const prefix =
        para.statementType && para.statementType !== '正文论述'
          ? `\\textbf{[${escapeLatexPreservingMath(para.statementType)}]} `
          : '';
      lines.push(`${prefix}${escapeLatexPreservingMath(para.translatedZhText || '')}`);
      lines.push('');

      const safeEquations = Array.isArray(para.equations) ? para.equations : [];
      for (const eq of safeEquations) {
        if (!eq || !eq.latex) continue;
        lines.push('\\begin{equation}');
        lines.push(`  ${eq.latex.trim()}`);
        if (eq.number) {
          lines.push(`  \\tag{${escapeLatexPreservingMath(eq.number)}}`);
        }
        lines.push('\\end{equation}');
        lines.push('');
      }

      if (para.ambiguityNote) {
        lines.push(
          `\\begin{quote}\\textbf{【原文歧义说明】}：${escapeLatexPreservingMath(para.ambiguityNote)}\\end{quote}`
        );
        lines.push('');
      }
      if (para.authorIssueNote) {
        lines.push(
          `\\begin{quote}\\textbf{【原文表述勘误/独立说明】}：${escapeLatexPreservingMath(para.authorIssueNote)}\\end{quote}`
        );
        lines.push('');
      }

      const safeAnnotations = Array.isArray(para.annotations) ? para.annotations : [];
      const visibleAnnotations = safeAnnotations.filter((ann) => {
        if (!ann || typeof ann !== 'object') return false;
        return shouldDisplayAnnotation(ann, nodes, includeSuppressedK1).visible;
      });

      if (visibleAnnotations.length > 0) {
        lines.push('\\begin{quote}');
        lines.push('\\textbf{精准批注解析}：');
        lines.push('\\begin{itemize}');
        for (const ann of visibleAnnotations) {
          const visibility = shouldDisplayAnnotation(ann, nodes, includeSuppressedK1);
          lines.push(
            `  \\item \\textbf{【${escapeLatexPreservingMath(ann.type || '理论解释')}｜${escapeLatexPreservingMath(ann.targetConceptZh)}（${escapeLatexPreservingMath(ann.targetConceptEn)}）】} (${visibility.currentLevel}｜${escapeLatexPreservingMath(ann.verificationStatus || '已核验')})`
          );
          if (ann.whatItIs) {
            lines.push(`    \\\\ \\textit{核心定义}：${escapeLatexPreservingMath(ann.whatItIs)}`);
          }
          if (ann.whyHereAndRole) {
            lines.push(`    \\\\ \\textit{文中作用}：${escapeLatexPreservingMath(ann.whyHereAndRole)}`);
          }
          if (ann.mathOrPhysicalMechanism) {
            lines.push(
              `    \\\\ \\textit{数学与物理机制}：${escapeLatexPreservingMath(ann.mathOrPhysicalMechanism)}`
            );
          }
          if (ann.formulaAnalysis && typeof ann.formulaAnalysis === 'object') {
            const safeSteps = Array.isArray(ann.formulaAnalysis.derivationSteps)
              ? ann.formulaAnalysis.derivationSteps
              : [];
            for (const step of safeSteps) {
              if (!step) continue;
              lines.push(
                `    \\\\ \\textbf{【${escapeLatexPreservingMath(step.sourceType || '原文推导')}】步骤 ${step.stepIndex || 1}}：${escapeLatexPreservingMath(step.descriptionZh || '')}`
              );
              if (step.latex) {
                lines.push(`    \\[ ${step.latex.trim()} \\]`);
              }
            }
          }
        }
        lines.push('\\end{itemize}');
        lines.push('\\end{quote}');
        lines.push('');
      }
    }
  }

  if (Array.isArray(doc.terminologyTable) && doc.terminologyTable.length > 0) {
    lines.push('\\section*{全文专业术语统一对照表}');
    lines.push('\\begin{itemize}');
    for (const term of doc.terminologyTable) {
      if (!term) continue;
      lines.push(
        `  \\item \\textbf{${escapeLatexPreservingMath(term.termZh)}}（${escapeLatexPreservingMath(term.termEn)}）[首次出现：${escapeLatexPreservingMath(term.firstAppearanceSection)} | ${term.knowledgeLevel}]：${escapeLatexPreservingMath(term.definitionSummary)}`
      );
    }
    lines.push('\\end{itemize}');
    lines.push('');
  }

  lines.push('\\end{document}');
  return lines.join('\n');
}

/**
 * Generates standard BibTeX (.bib) entries for the active paper, its internet-verified
 * grounding sources, and personal reading materials if no paper is active yet.
 */
export function exportAcademicBibtex(
  doc: TranslatedPaperDocument | null,
  preAnalysis?: PaperPreAnalysis | null
): string {
  const entries: string[] = [];
  const seenKeys = new Set<string>();

  const titleEn = doc?.titleEn || preAnalysis?.titleEn || '';
  const titleZh = doc?.titleZh || preAnalysis?.titleZh || '';
  const authors = doc?.authors || preAnalysis?.authors || '';
  const arxivIdOrDoi = doc?.arxivIdOrDoi || preAnalysis?.arxivIdOrDoi || '';
  const groundingSources = doc?.groundingSources || preAnalysis?.groundingSources || [];

  const allocateKey = (base: string): string => {
    let key = sanitizeBibtexKey(base, 'physica_ref');
    let counter = 2;
    while (seenKeys.has(key)) {
      key = `${sanitizeBibtexKey(base, 'physica_ref')}_${counter++}`;
    }
    seenKeys.add(key);
    return key;
  };

  if (titleEn || titleZh) {
    const meta = extractArxivOrDoiFields(arxivIdOrDoi);
    const primaryKey = allocateKey(
      meta.arxivId ? `arxiv_${meta.arxivId}` : `${authors.split(',')[0] || 'paper'}_${titleEn.slice(0, 20)}`
    );
    const entryType = meta.doi ? 'article' : 'misc';
    const fields: string[] = [
      `  title = {${titleEn || titleZh}}`,
      `  author = {${authors || 'Unknown Author'}}`,
      `  year = {${meta.year || String(new Date().getFullYear())}}`,
    ];
    if (meta.arxivId) {
      fields.push(`  eprint = {${meta.arxivId}}`);
      fields.push(`  archivePrefix = {arXiv}`);
      fields.push(`  primaryClass = {hep-th}`);
    }
    if (meta.doi) {
      fields.push(`  doi = {${meta.doi}}`);
    }
    if (doc?.institutionOrJournal) {
      fields.push(`  journal = {${doc.institutionOrJournal}}`);
    }
    if (meta.url) {
      fields.push(`  url = {${meta.url}}`);
    }
    if (titleZh && titleEn) {
      fields.push(`  note = {中文精读译题：${titleZh}}`);
    }
    entries.push(`@${entryType}{${primaryKey},\n${fields.join(',\n')}\n}`);
  }

  for (const src of groundingSources) {
    if (!src || !src.title) continue;
    const meta = extractArxivOrDoiFields(src.title, src.uri);
    const key = allocateKey(
      meta.arxivId ? `arxiv_${meta.arxivId}` : `${src.sourceType || 'ref'}_${src.title.slice(0, 24)}`
    );
    const entryType = meta.doi ? 'article' : 'misc';
    const fields: string[] = [
      `  title = {${src.title}}`,
      `  year = {${meta.year || String(new Date().getFullYear())}}`,
    ];
    if (meta.arxivId) {
      fields.push(`  eprint = {${meta.arxivId}}`);
      fields.push(`  archivePrefix = {arXiv}`);
    }
    if (meta.doi) {
      fields.push(`  doi = {${meta.doi}}`);
    }
    if (src.uri) {
      fields.push(`  url = {${src.uri}}`);
    }
    if (src.snippet) {
      fields.push(`  note = {${src.sourceType || 'Reference'}: ${src.snippet.replace(/[{}]/g, '')}}`);
    }
    entries.push(`@${entryType}{${key},\n${fields.join(',\n')}\n}`);
  }

  if (entries.length === 0) {
    return [
      '% 暂无可导出的论文或核验文献 BibTeX 条目。',
      '% 请在工作台「2. 论文预分析与缺口」中导入英文论文或执行 arXiv / CrossRef 检索后再次导出。',
    ].join('\n');
  }

  return entries.join('\n\n');
}

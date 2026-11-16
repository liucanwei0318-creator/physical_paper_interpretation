import React from 'react';
import katex from 'katex';

interface LatexBlockProps {
  latex: string;
  displayMode?: boolean;
  equationNumber?: string;
  className?: string;
}

export const LatexBlock: React.FC<LatexBlockProps> = ({
  latex,
  displayMode = false,
  equationNumber,
  className = '',
}) => {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return latex;
    }
  }, [latex, displayMode]);

  if (displayMode) {
    return (
      <div
        className={`my-4 py-3 px-4 bg-slate-50/90 border border-slate-200/80 rounded-md flex items-center justify-between gap-3 ${className}`}
      >
        <div
          className="min-w-0 flex-1 text-center text-slate-900 overflow-x-auto overflow-y-hidden [&_.katex-display]:my-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {equationNumber && (
          <span className="font-mono-tabular text-xs text-slate-500 shrink-0 select-all">
            ({equationNumber})
          </span>
        )}
      </div>
    );
  }

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface MixedAcademicTextProps {
  text: string;
  className?: string;
}

/**
 * Normalizes academic text that may contain bare LaTeX commands (e.g. in targetEquationOrClause
 * like "-S_{\mathrm{top}} = \ln D" or "公式 \gamma_A") without explicit $...$ delimiters.
 */
export function normalizeAcademicMathDelimiters(raw: string): string {
  if (!raw) return '';
  let normalized = raw
    .replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');

  // If the string already contains $ delimiters, return as-is
  if (normalized.includes('$')) {
    return normalized;
  }

  const trimmed = normalized.trim();
  const hasLatexCommandOrSubSup =
    /\\(?:frac|sqrt|sum|int|prod|partial|nabla|infty|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|mathrm|mathcal|mathbb|mathbf|mathfrak|hat|bar|tilde|vec|dot|ln|log|exp|sin|cos|tan|det|Tr|tr|langle|rangle|left|right|cdot|times|otimes|oplus|dagger|hbar|ell|le|ge|neq|equiv|approx|sim|propto|to|rightarrow|Rightarrow)\b/.test(
      trimmed
    ) || /[A-Za-z0-9)\]}]_(?:\{[^{}]+\}|[A-Za-z0-9])|[A-Za-z0-9)\]}]\^(?:\{[^{}]+\}|[A-Za-z0-9])/.test(trimmed);

  if (!hasLatexCommandOrSubSup) {
    return normalized;
  }

  // Case 1: Pure formula clause with no Chinese characters and short length (e.g. "-S_{\mathrm{top}} = \ln D")
  if (!/[\u4e00-\u9fa5]/.test(trimmed) && trimmed.length <= 160) {
    return `$${trimmed}$`;
  }

  // Case 2: Mixed Chinese + bare LaTeX tokens (supports nested braces like \frac{\mathrm{Area}(\gamma_A)}{4G_N^{(d+2)}})
  const latexAtom = `(?:\\\\[a-zA-Z]+(?:\\{(?:[^{}]|\\{[^{}]*\\})*\\})*(?:\\([A-Za-z0-9\\\\_{}^+-]+\\))?|[A-Za-z0-9()[\\]]+(?:_(?:\\{(?:[^{}]|\\{[^{}]*\\})*\\}|[A-Za-z0-9\\\\]+)|\\^(?:\\{(?:[^{}]|\\{[^{}]*\\})*\\}|[A-Za-z0-9\\\\]+))+)+`;
  const latexExprRegex = new RegExp(
    `(${latexAtom}(?:\\s*[=+\\-*/<>≈≡∼]\\s*(?:${latexAtom}|[0-9A-Za-z()\\[\\]]+))*)`,
    'g'
  );
  normalized = normalized.replace(latexExprRegex, '$$$1$$');

  return normalized;
}

function renderFormattedPlainSegment(rawSeg: string, keyPrefix: string): React.ReactNode {
  const cleaned = rawSeg
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^(\s*)[*+-]\s+/gm, '$1• ');

  const tokenRegex = /(\*\*[^*]+?\*\*|`[^`\n]+?`|(?<!\*)\*[^*\n]+?\*(?!\*))/g;
  const parts = cleaned.split(tokenRegex);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-current">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-c-${i}`}
          className="px-1 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[0.92em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={`${keyPrefix}-i-${i}`} className="italic text-current">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>;
  });
}

/**
 * Splits Chinese/English academic prose containing $$...$$ or $...$ LaTeX segments
 * and renders math expressions via KaTeX inline or display mode, plus **bold**, *italic*, `code`, and bullets.
 */
export const MixedAcademicText: React.FC<MixedAcademicTextProps> = ({
  text,
  className = '',
}) => {
  const segments = React.useMemo(() => {
    if (!text) return [];
    const prepared = normalizeAcademicMathDelimiters(text);
    // Match $$...$$ first, then $...$
    const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
    const parts = prepared.split(regex);
    return parts.filter((p) => p !== '');
  }, [text]);

  return (
    <span className={className}>
      {segments.map((seg, index) => {
        if (seg.startsWith('$$') && seg.endsWith('$$') && seg.length > 4) {
          const innerLatex = seg.slice(2, -2).trim();
          return <LatexBlock key={index} latex={innerLatex} displayMode={true} />;
        }
        if (seg.startsWith('$') && seg.endsWith('$') && seg.length > 2) {
          const innerLatex = seg.slice(1, -1).trim();
          return <LatexBlock key={index} latex={innerLatex} displayMode={false} />;
        }
        return (
          <React.Fragment key={index}>
            {renderFormattedPlainSegment(seg, `seg-${index}`)}
          </React.Fragment>
        );
      })}
    </span>
  );
};



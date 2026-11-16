import React, { useState, useMemo } from 'react';
import {
  DerivationMindMapNode,
  DerivationMindMapNodeKind,
  DerivationMindMapTree,
} from '../types/physics';
import { countMindMapNodes } from '../utils/derivationMindMap';
import { LatexBlock, MixedAcademicText } from './LatexRenderer';
import { ChevronDown, ChevronRight, GitBranch, Maximize2, MessageSquare, RefreshCw, X } from 'lucide-react';
import { DiagnosticAlert } from './DiagnosticAlert';

interface DerivationMindMapProps {
  tree: DerivationMindMapTree;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
  onCollapsePanel?: () => void;
  onAskGeminiAboutNode?: (node: DerivationMindMapNode) => void;
}

function getNodeKindLabel(kind: DerivationMindMapNodeKind): {
  label: string;
  accentClass: string;
  dotColor: string;
} {
  switch (kind) {
    case 'target':
      return {
        label: '目标公式',
        accentClass: 'text-slate-900',
        dotColor: 'bg-slate-900',
      };
    case 'premise':
      return {
        label: '前置基础',
        accentClass: 'text-indigo-700',
        dotColor: 'bg-indigo-600',
      };
    case 'transform':
      return {
        label: '关键变换',
        accentClass: 'text-blue-700',
        dotColor: 'bg-blue-600',
      };
    case 'approximation':
      return {
        label: '近似与展开',
        accentClass: 'text-amber-700',
        dotColor: 'bg-amber-600',
      };
    case 'verification':
      return {
        label: '独立核验',
        accentClass: 'text-emerald-700',
        dotColor: 'bg-emerald-600',
      };
    case 'conclusion':
    default:
      return {
        label: '物理结论',
        accentClass: 'text-slate-800',
        dotColor: 'bg-slate-600',
      };
  }
}

interface VerticalTreeBranchProps {
  node: DerivationMindMapNode;
  depth: number;
  isLast: boolean;
  collapsedIds: Set<string>;
  onToggleNode: (nodeId: string) => void;
  onAskGeminiAboutNode?: (node: DerivationMindMapNode) => void;
}

const VerticalTreeBranch: React.FC<VerticalTreeBranchProps> = ({
  node,
  depth,
  isLast,
  collapsedIds,
  onToggleNode,
  onAskGeminiAboutNode,
}) => {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isCollapsed = collapsedIds.has(node.id);
  const kindMeta = getNodeKindLabel(node.nodeKind);

  return (
    <div className="relative pl-6">
      {/* Vertical trunk line from parent */}
      {depth > 0 && (
        <>
          <span
            aria-hidden="true"
            className={`absolute left-2.5 top-0 w-px bg-slate-300 ${
              isLast ? 'h-5' : 'bottom-0'
            }`}
          />
          {/* Horizontal branch connector into node card */}
          <span
            aria-hidden="true"
            className="absolute left-2.5 top-5 w-3.5 h-px bg-slate-300"
          />
        </>
      )}

      <div
        className={`border rounded-md p-3 transition-colors ${
          depth === 0
            ? 'bg-slate-900 text-white border-slate-900'
            : depth === 1
            ? 'bg-white border-slate-300'
            : 'bg-slate-50/80 border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleNode(node.id);
                }}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `展开「${node.title}」分支` : `折叠「${node.title}」分支`}
                className={`mt-0.5 p-0.5 rounded shrink-0 cursor-pointer transition-colors ${
                  depth === 0
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            ) : (
              <span
                aria-hidden="true"
                className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                  depth === 0 ? 'bg-blue-400' : kindMeta.dotColor
                }`}
              />
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div
                className={`text-[11px] font-mono-tabular flex flex-wrap items-center gap-1.5 ${
                  depth === 0 ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                <span className={depth === 0 ? 'text-blue-300 font-semibold' : `${kindMeta.accentClass} font-semibold`}>
                  {kindMeta.label}
                </span>
                {node.sourceTag && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>【{node.sourceTag}】</span>
                  </>
                )}
                {hasChildren && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{node.children!.length} 个子步骤</span>
                  </>
                )}
              </div>

              <h4
                className={`text-xs sm:text-sm font-semibold leading-snug ${
                  depth === 0 ? 'text-white' : 'text-slate-900'
                }`}
              >
                <MixedAcademicText text={node.title} />
              </h4>
            </div>
          </div>

          {onAskGeminiAboutNode && depth > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAskGeminiAboutNode(node);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="在右侧伴读导师栏针对此推导步骤提问"
            >
              <MessageSquare className="w-3 h-3" />
              <span>追问此步</span>
            </button>
          )}
        </div>

        {node.formulaLatex && (
          <div
            className={`mt-2.5 rounded ${
              depth === 0 ? 'bg-white text-slate-900 px-1' : ''
            }`}
          >
            <LatexBlock
              latex={node.formulaLatex}
              displayMode={true}
              className={
                depth === 0
                  ? '!my-1.5 !py-2 !px-3 !border-slate-200 text-xs sm:text-sm'
                  : '!my-1.5 !py-2 !px-3 !bg-white text-xs sm:text-sm'
              }
            />
          </div>
        )}

        <p
          className={`mt-2 text-xs leading-relaxed ${
            depth === 0 ? 'text-slate-200' : 'text-slate-700'
          }`}
        >
          <MixedAcademicText text={node.explanationZh} />
        </p>
      </div>

      {hasChildren && !isCollapsed && (
        <div className="mt-2.5 space-y-2.5">
          {node.children!.map((child, idx) => (
            <VerticalTreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={idx === node.children!.length - 1}
              collapsedIds={collapsedIds}
              onToggleNode={onToggleNode}
              onAskGeminiAboutNode={onAskGeminiAboutNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface HorizontalMindMapBranchProps {
  node: DerivationMindMapNode;
  depth: number;
  onAskGeminiAboutNode?: (node: DerivationMindMapNode) => void;
}

const HorizontalMindMapBranch: React.FC<HorizontalMindMapBranchProps> = ({
  node,
  depth,
  onAskGeminiAboutNode,
}) => {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const kindMeta = getNodeKindLabel(node.nodeKind);

  return (
    <div className="flex items-center">
      <div
        className={`w-[320px] sm:w-[350px] shrink-0 border rounded-md p-3 space-y-2 ${
          depth === 0
            ? 'bg-slate-900 text-white border-slate-900'
            : depth === 1
            ? 'bg-white border-slate-300'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
          <span className={depth === 0 ? 'text-blue-300 font-semibold' : `${kindMeta.accentClass} font-semibold`}>
            {kindMeta.label}
            {node.sourceTag ? ` · 【${node.sourceTag}】` : ''}
          </span>
          {onAskGeminiAboutNode && depth > 0 && (
            <button
              type="button"
              onClick={() => onAskGeminiAboutNode(node)}
              className="text-blue-600 hover:underline cursor-pointer"
            >
              追问
            </button>
          )}
        </div>
        <div
          className={`text-xs sm:text-sm font-semibold leading-snug ${
            depth === 0 ? 'text-white' : 'text-slate-900'
          }`}
        >
          <MixedAcademicText text={node.title} />
        </div>
        {node.formulaLatex && (
          <div className={depth === 0 ? 'bg-white text-slate-900 rounded px-1' : ''}>
            <LatexBlock
              latex={node.formulaLatex}
              displayMode={true}
              className="!my-1 !py-2 !px-2.5 text-xs"
            />
          </div>
        )}
        <p className={`text-xs leading-relaxed ${depth === 0 ? 'text-slate-200' : 'text-slate-700'}`}>
          <MixedAcademicText text={node.explanationZh} />
        </p>
      </div>

      {hasChildren && (
        <div className="flex items-center">
          {/* Stem leaving parent */}
          <div className="w-6 h-px bg-slate-300 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-4 relative py-1">
            {node.children!.map((child, idx) => {
              const onlyChild = node.children!.length === 1;
              const isFirst = idx === 0;
              const isLast = idx === node.children!.length - 1;
              return (
                <div key={child.id} className="relative flex items-center pl-6">
                  {!onlyChild && (
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 w-px bg-slate-300 ${
                        isFirst
                          ? 'top-1/2 bottom-0'
                          : isLast
                          ? 'top-0 bottom-1/2'
                          : 'top-0 bottom-0'
                      }`}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 w-6 h-px bg-slate-300"
                  />
                  <HorizontalMindMapBranch
                    node={child}
                    depth={depth + 1}
                    onAskGeminiAboutNode={onAskGeminiAboutNode}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const DerivationMindMap: React.FC<DerivationMindMapProps> = ({
  tree,
  isRegenerating = false,
  onRegenerate,
  onCollapsePanel,
  onAskGeminiAboutNode,
}) => {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [wideModalOpen, setWideModalOpen] = useState(false);

  const stats = useMemo(() => countMindMapNodes(tree.root), [tree.root]);

  const handleToggleNode = (nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleCollapseToTopBranches = () => {
    const branchIds = new Set<string>();
    for (const child of tree.root.children || []) {
      if (child.children && child.children.length > 0) {
        branchIds.add(child.id);
      }
    }
    setCollapsedIds(branchIds);
  };

  const handleExpandAll = () => {
    setCollapsedIds(new Set());
  };

  return (
    <>
      <section
        data-testid="derivation-mindmap-tree"
        aria-label={`${tree.equationLabel} 数学推导思维导图`}
        onClick={(e) => e.stopPropagation()}
        className="mt-4 bg-slate-50/90 border border-blue-200 rounded-lg p-4 sm:p-5 space-y-4"
      >
        {/* Mind Map Header */}
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-200">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono-tabular text-blue-700 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span>数学推导思维导图 · <MixedAcademicText text={tree.equationLabel} /></span>
              </span>
              <span className="text-slate-400 font-normal">
                ({stats.totalNodes} 个节点 · {stats.maxDepth} 层树状结构 ·{' '}
                {tree.generatedBy === 'gemini' ? 'Gemini 深度推导' : '结构化推导骨架'})
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <MixedAcademicText text={tree.summaryZh} />
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded transition-colors cursor-pointer"
            >
              全部展开
            </button>
            <button
              type="button"
              onClick={handleCollapseToTopBranches}
              className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded transition-colors cursor-pointer"
            >
              仅看一级主干
            </button>
            <button
              type="button"
              onClick={() => setWideModalOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>横向树图大览</span>
            </button>
            {onRegenerate && (
              <button
                type="button"
                disabled={isRegenerating}
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 border border-slate-200 rounded transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>重新生成</span>
              </button>
            )}
            {onCollapsePanel && (
              <button
                type="button"
                onClick={onCollapsePanel}
                aria-label="收起数学推导思维导图"
                className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                收起
              </button>
            )}
          </div>
        </div>

        {(tree.generationMeta?.degraded || tree.generatedBy !== 'gemini') && (
          <DiagnosticAlert
            variant="degraded"
            title="当前展示本地结构化公式推导骨架（Gemini 未生成完整语义步骤）"
            message={
              tree.generationMeta?.reason ||
              '实时调用 Gemini 生成思维导图时出现异常或配额受限，已保留核心公式层级供参考。'
            }
            meta={tree.generationMeta}
            retryLabel="重新调用 Gemini 生成"
            isRetrying={isRegenerating}
            onRetry={onRegenerate}
          />
        )}

        {/* Hierarchical Tree View */}
        <div className="-ml-6">
          <VerticalTreeBranch
            node={tree.root}
            depth={0}
            isLast={true}
            collapsedIds={collapsedIds}
            onToggleNode={handleToggleNode}
            onAskGeminiAboutNode={onAskGeminiAboutNode}
          />
        </div>
      </section>

      {/* Full-Width Horizontal Mind Map Modal */}
      {wideModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`mindmap-modal-title-${tree.paragraphId}`}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-[94vw] w-full max-h-[88vh] flex flex-col shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3
                  id={`mindmap-modal-title-${tree.paragraphId}`}
                  className="text-base font-bold text-slate-900 flex items-center gap-2"
                >
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <span>{tree.equationLabel} · 横向数学推导思维导图全景</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  <MixedAcademicText text={tree.summaryZh} />
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWideModalOpen(false)}
                aria-label="关闭横向思维导图窗口"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50/70">
              <div className="inline-block min-w-max">
                <HorizontalMindMapBranch
                  node={tree.root}
                  depth={0}
                  onAskGeminiAboutNode={(node) => {
                    setWideModalOpen(false);
                    onAskGeminiAboutNode?.(node);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

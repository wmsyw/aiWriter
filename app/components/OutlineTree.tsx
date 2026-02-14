'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface OutlineNode {
  id: string;
  title: string;
  content: string;
  level: 'rough' | 'detailed' | 'chapter';
  children?: OutlineNode[];
  isExpanded?: boolean;
  isGenerating?: boolean;
}

interface OutlineTreeNodeProps {
  node: OutlineNode;
  onToggle: (id: string) => void;
  onGenerateNext?: (node: OutlineNode) => void;
  onRegenerate?: (node: OutlineNode) => void;
  onUpdateNode?: (id: string, content: string) => void;
  isSelected?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
  selectionMode?: boolean;
  readOnly?: boolean;
  isLast?: boolean;
  depth?: number;
}

const LEVEL_META: Record<OutlineNode['level'], { label: string; short: string; nextLevel?: string }> = {
  rough: { label: '粗纲', short: 'R', nextLevel: '细纲' },
  detailed: { label: '细纲', short: 'D', nextLevel: '章节' },
  chapter: { label: '章节', short: 'C' },
};

const LEVEL_STYLES: Record<
  OutlineNode['level'],
  {
    container: string;
    header: string;
    title: string;
    contentText: string;
    textarea: string;
    idBadge: string;
    levelBadge: string;
    fadedBg: string;
  }
> = {
  rough: {
    container: 'rounded-2xl border border-emerald-500/28 bg-gradient-to-br from-emerald-500/10 to-zinc-900/65 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]',
    header: 'p-4 md:p-5',
    title: 'text-base md:text-lg font-bold text-zinc-100',
    contentText: 'text-sm md:text-base text-zinc-300 leading-relaxed',
    textarea: 'text-sm md:text-base text-zinc-200 placeholder-zinc-500',
    idBadge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
    levelBadge: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-200',
    fadedBg: 'from-zinc-900/95',
  },
  detailed: {
    container: 'rounded-xl border border-sky-500/20 bg-zinc-900/65',
    header: 'p-3 md:p-4',
    title: 'text-sm md:text-base font-semibold text-zinc-100',
    contentText: 'text-sm text-zinc-300 leading-relaxed',
    textarea: 'text-sm text-zinc-200 placeholder-zinc-500',
    idBadge: 'border-sky-500/25 bg-sky-500/10 text-sky-200',
    levelBadge: 'border-sky-500/25 bg-sky-500/12 text-sky-200',
    fadedBg: 'from-zinc-900/95',
  },
  chapter: {
    container: 'rounded-lg border border-zinc-800/90 bg-zinc-900/55',
    header: 'p-3',
    title: 'text-sm font-medium text-zinc-100',
    contentText: 'text-xs md:text-sm text-zinc-300 leading-relaxed',
    textarea: 'text-xs md:text-sm text-zinc-200 placeholder-zinc-500',
    idBadge: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    levelBadge: 'border-amber-500/30 bg-amber-500/14 text-amber-200',
    fadedBg: 'from-zinc-900/95',
  },
};

const OutlineTreeNode = ({ 
  node, 
  onToggle, 
  onGenerateNext,
  onRegenerate,
  onUpdateNode,
  isSelected = false,
  selectedIds = new Set(),
  onSelect,
  selectionMode = false,
  readOnly = false,
  isLast = false,
  depth = 0,
}: OutlineTreeNodeProps) => {
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  
  const effectiveLevel = node.level || 'rough';
  const isLeaf = effectiveLevel === 'chapter';
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const currentStyle = LEVEL_STYLES[effectiveLevel];
  const levelMeta = LEVEL_META[effectiveLevel];
  const nodeContent = node.content || '';
  const nodeContentLength = nodeContent.trim().length;
  const displayNodeId = node.id.length > 10 ? node.id.slice(0, 10) : node.id;
  const shouldShowExpandToggle = hasChildren;
  const nextLevelName = levelMeta.nextLevel;

  return (
    <div className={`relative ${depth > 0 ? 'pl-4' : ''} ${effectiveLevel === 'rough' ? 'mb-7' : 'mb-3'}`}>
      {depth > 0 && (
        <>
          <div className={`absolute left-1 w-px bg-zinc-800/70 ${isLast ? 'top-0 h-6' : 'top-0 bottom-0'}`} />
          <div className="absolute left-1 top-6 w-3 h-px bg-zinc-800/70" />
        </>
      )}

      <div className={`group relative transition-all duration-200 ${currentStyle.container} ${isSelected ? 'ring-2 ring-emerald-500/45 bg-emerald-500/8' : ''}`}>
        <div className={currentStyle.header}>
          <div className="flex items-start gap-3">
            {selectionMode && (
              <div className="pt-1.5">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => onSelect?.(node.id, e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/50"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => shouldShowExpandToggle && onToggle(node.id)}
              className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border border-zinc-700/80 text-zinc-400 transition-colors ${
                shouldShowExpandToggle ? 'hover:bg-zinc-800 hover:text-zinc-100' : 'cursor-default opacity-40'
              }`}
              aria-label={node.isExpanded ? '收起节点' : '展开节点'}
              disabled={!shouldShowExpandToggle}
            >
              {shouldShowExpandToggle ? (
                <svg
                  className={`mx-auto h-3 w-3 transform transition-transform duration-200 ${node.isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-zinc-500" />
              )}
            </button>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${currentStyle.idBadge}`}
                  title={node.id}
                >
                  {displayNodeId}
                </span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${currentStyle.levelBadge}`}>
                  {levelMeta.short}
                </span>
                {hasChildren && (
                  <span className="text-[11px] text-zinc-500">
                    子节点 {node.children?.length || 0}
                  </span>
                )}
                {node.isGenerating && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    生成中
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4
                  className={`${currentStyle.title} min-w-0 flex-1 break-words cursor-pointer`}
                  onClick={() => setIsContentExpanded((prev) => !prev)}
                >
                  {node.title || `未命名${levelMeta.label}`}
                </h4>

                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  {!readOnly && onRegenerate && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(node);
                      }}
                      disabled={node.isGenerating}
                      className="rounded-lg border border-zinc-700/80 p-1.5 text-zinc-400 transition-colors hover:border-amber-500/35 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50"
                      title={`重新生成此${levelMeta.label}`}
                    >
                      {node.isGenerating ? (
                        <svg className="h-4 w-4 animate-spin text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4zm2 5.29A8 8 0 014 12H0c0 3.05 1.14 5.83 3 7.94l3-2.65z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.58m15.35 2A8 8 0 004.58 9M9 9H4m16 11v-5h-.58m0 0a8 8 0 01-15.35-2M15 20h5" />
                        </svg>
                      )}
                    </button>
                  )}

                  {!isLeaf && !readOnly && onGenerateNext && nextLevelName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateNext(node);
                      }}
                      disabled={node.isGenerating}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/22 disabled:opacity-50"
                    >
                      生成{nextLevelName}
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div
                className={`relative mt-1 ${isContentExpanded ? '' : 'max-h-[4.1em] overflow-hidden'} ${readOnly ? '' : 'cursor-text'}`}
                onClick={() => !isContentExpanded && setIsContentExpanded(true)}
              >
                {readOnly ? (
                  <p className={`${currentStyle.contentText} whitespace-pre-wrap`}>
                    {nodeContent || `暂无${levelMeta.label}内容`}
                  </p>
                ) : (
                  <textarea
                    className={`w-full resize-none rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-3 py-2 leading-relaxed transition-colors focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 ${currentStyle.textarea}`}
                    value={nodeContent}
                    onChange={(e) => onUpdateNode?.(node.id, e.target.value)}
                    rows={effectiveLevel === 'rough' ? 4 : 3}
                    placeholder={`请输入${levelMeta.label}内容...`}
                  />
                )}

                {!isContentExpanded && nodeContentLength > 80 && (
                  <div className={`pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t to-transparent ${currentStyle.fadedBg}`} />
                )}
              </div>

              <div className="flex min-h-4 items-center justify-between">
                {nodeContentLength > 80 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsContentExpanded((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    {isContentExpanded ? '收起内容' : '展开全文'}
                    <svg
                      className={`h-3 w-3 transform transition-transform ${isContentExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                ) : (
                  <span />
                )}
                <span className="text-[11px] text-zinc-600">{nodeContentLength} 字</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {node.isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 space-y-2"
          >
            {node.children!.map((child, index) => (
              <OutlineTreeNode 
                key={child.id} 
                node={child} 
                onToggle={onToggle}
                onGenerateNext={onGenerateNext}
                onRegenerate={onRegenerate}
                onUpdateNode={onUpdateNode}
                isSelected={selectedIds.has(child.id)}
                selectedIds={selectedIds}
                onSelect={onSelect}
                selectionMode={selectionMode}
                readOnly={readOnly}
                isLast={index === node.children!.length - 1}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface OutlineTreeProps {
  nodes: OutlineNode[];
  onGenerateNext?: (node: OutlineNode) => void;
  onRegenerate?: (node: OutlineNode) => void;
  onUpdateNode?: (id: string, content: string) => void;
  onToggle: (id: string) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
  selectionMode?: boolean;
  readOnly?: boolean;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function OutlineTree({ 
  nodes, 
  onGenerateNext,
  onRegenerate,
  onUpdateNode,
  onToggle,
  selectedIds = new Set(),
  onSelect,
  selectionMode = false,
  readOnly = false,
  className = '',
  emptyTitle = '暂无大纲数据',
  emptyDescription = '点击上方按钮生成大纲',
}: OutlineTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-lg font-medium text-gray-400">{emptyTitle}</p>
        <p className="text-sm text-gray-600 mt-2">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {nodes.map((node, index) => (
        <OutlineTreeNode 
          key={node.id} 
          node={node} 
          onToggle={onToggle}
          onGenerateNext={onGenerateNext}
          onRegenerate={onRegenerate}
          onUpdateNode={onUpdateNode}
          isSelected={selectedIds.has(node.id)}
          selectedIds={selectedIds}
          onSelect={onSelect}
          selectionMode={selectionMode}
          readOnly={readOnly}
          depth={0}
          isLast={index === nodes.length - 1}
        />
      ))}
    </div>
  );
}

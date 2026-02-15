'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Checkbox } from '@/app/components/ui/Checkbox';
import { Textarea } from '@/app/components/ui/Input';

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
  depth?: number;
}

const LEVEL_META: Record<
  OutlineNode['level'],
  {
    order: string;
    label: string;
    short: string;
    nextLevel?: string;
    tone: string;
    badge: string;
    stage: string;
    step: string;
    card: string;
    title: string;
    text: string;
    textarea: string;
    padding: string;
  }
> = {
  rough: {
    order: 'L1',
    label: '粗纲',
    short: 'R',
    nextLevel: '细纲',
    tone: 'bg-emerald-400',
    badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
    stage: '卷级蓝图',
    step: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200',
    card: 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-zinc-900/80 to-zinc-900/95',
    title: 'text-base md:text-lg font-semibold text-zinc-100',
    text: 'text-sm md:text-base text-zinc-300 leading-relaxed',
    textarea: 'text-sm md:text-base text-zinc-200 placeholder-zinc-500',
    padding: 'p-4 md:p-5',
  },
  detailed: {
    order: 'L2',
    label: '细纲',
    short: 'D',
    nextLevel: '章节纲',
    tone: 'bg-sky-400',
    badge: 'border-sky-500/30 bg-sky-500/14 text-sky-200',
    stage: '情节分段',
    step: 'border-sky-500/35 bg-sky-500/12 text-sky-200',
    card: 'border-sky-500/22 bg-zinc-900/75',
    title: 'text-sm md:text-base font-semibold text-zinc-100',
    text: 'text-sm text-zinc-300 leading-relaxed',
    textarea: 'text-sm text-zinc-200 placeholder-zinc-500',
    padding: 'p-3.5 md:p-4',
  },
  chapter: {
    order: 'L3',
    label: '章节纲',
    short: 'C',
    tone: 'bg-amber-400',
    badge: 'border-amber-500/30 bg-amber-500/14 text-amber-200',
    stage: '单章执行',
    step: 'border-amber-500/35 bg-amber-500/12 text-amber-200',
    card: 'border-zinc-700/80 bg-zinc-900/70',
    title: 'text-sm font-medium text-zinc-100',
    text: 'text-xs md:text-sm text-zinc-300 leading-relaxed',
    textarea: 'text-xs md:text-sm text-zinc-200 placeholder-zinc-500',
    padding: 'p-3',
  },
};

function OutlineTreeNode({
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
  depth = 0,
}: OutlineTreeNodeProps) {
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const effectiveLevel = node.level || 'rough';
  const meta = LEVEL_META[effectiveLevel];
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const canGenerateNext = Boolean(onGenerateNext && meta.nextLevel && effectiveLevel !== 'chapter');
  const displayNodeId = node.id.length > 12 ? node.id.slice(0, 12) : node.id;
  const nodeTitle = node.title?.trim() || `未命名${meta.label}`;
  const nodeContent = node.content || '';
  const nodeContentLength = nodeContent.trim().length;
  const previewThreshold = effectiveLevel === 'rough' ? 220 : 160;
  const showCollapsedOverlay = readOnly && !isContentExpanded && nodeContentLength > previewThreshold;
  const showReadMore = readOnly && nodeContentLength > previewThreshold;
  const hasExpandableChildren = hasChildren && Boolean(node.isExpanded);
  const depthLabel = depth > 0 ? `D${depth + 1}` : meta.order;

  return (
    <div className="space-y-2.5">
      <div className="relative flex gap-3">
        <div className="hidden w-8 shrink-0 sm:block">
          <div className={`mt-3 flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-semibold tracking-wide ${meta.step}`}>
            {depthLabel}
          </div>
          {hasExpandableChildren && <div className="mx-auto mt-1 h-[calc(100%-2.5rem)] w-px bg-zinc-800/85" />}
        </div>

        <div
          className={`group relative min-w-0 flex-1 overflow-hidden rounded-2xl border transition-all duration-200 ${
            meta.card
          } ${isSelected ? 'border-emerald-500/45 ring-2 ring-emerald-500/35' : 'hover:border-zinc-600/80'}`}
        >
          <span className={`absolute left-0 top-0 h-full w-1.5 ${meta.tone}`} />

          <div className={`${meta.padding} pl-4 md:pl-5`}>
            <div className="flex items-start gap-2.5">
              {selectionMode && (
                <div className="pt-1">
                  <Checkbox
                    checked={isSelected}
                    onChange={(event) => onSelect?.(node.id, event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/50"
                    aria-label={`选择节点 ${nodeTitle}`}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => hasChildren && onToggle(node.id)}
                disabled={!hasChildren}
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-zinc-400 transition-colors ${
                  hasChildren
                    ? 'border-zinc-700/80 bg-zinc-900/70 hover:border-zinc-500/90 hover:text-zinc-100'
                    : 'border-zinc-800/80 bg-zinc-900/40 opacity-45'
                }`}
                aria-label={node.isExpanded ? '收起节点' : '展开节点'}
              >
                {hasChildren ? (
                  <svg
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${node.isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                )}
              </button>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.badge}`}>
                    {meta.short} · {meta.label}
                  </span>
                  <span className="rounded-md border border-zinc-700/80 bg-zinc-900/75 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {meta.stage}
                  </span>
                  <span
                    className="rounded-md border border-zinc-700/80 bg-zinc-900/75 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                    title={node.id}
                  >
                    {displayNodeId}
                  </span>
                  {hasChildren && (
                    <span className="text-[11px] text-zinc-500">
                      子节点 {node.children?.length || 0}
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-500">{nodeContentLength} 字</span>
                  {node.isGenerating && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                      生成中
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                  <h4 className={`${meta.title} min-w-0 flex-1 break-words`}>{nodeTitle}</h4>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {!readOnly && onRegenerate && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRegenerate(node);
                        }}
                        disabled={node.isGenerating}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/70 px-2.5 text-[11px] text-zinc-300 transition-colors hover:border-amber-500/35 hover:bg-amber-500/16 hover:text-amber-200 disabled:opacity-45"
                        title={`重新生成此${meta.label}`}
                      >
                        <svg className={`h-3.5 w-3.5 ${node.isGenerating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.58m15.35 2A8 8 0 004.58 9M9 9H4m16 11v-5h-.58m0 0a8 8 0 01-15.35-2M15 20h5" />
                        </svg>
                        重生成
                      </button>
                    )}

                    {canGenerateNext && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onGenerateNext?.(node);
                        }}
                        disabled={node.isGenerating}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/24 disabled:opacity-50"
                      >
                        生成{meta.nextLevel}
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className={`relative rounded-xl border border-zinc-800/80 bg-zinc-950/45 p-2.5 ${showCollapsedOverlay ? 'max-h-[6.4em] overflow-hidden' : ''}`}>
                  {readOnly ? (
                    <p className={`${meta.text} whitespace-pre-wrap`}>
                      {nodeContent || `暂无${meta.label}内容`}
                    </p>
                  ) : (
                    <Textarea
                      value={nodeContent}
                      onChange={(event) => onUpdateNode?.(node.id, event.target.value)}
                      rows={effectiveLevel === 'rough' ? 5 : effectiveLevel === 'detailed' ? 4 : 3}
                      placeholder={`请输入${meta.label}内容...`}
                      className={`w-full resize-y rounded-lg border border-zinc-800/85 bg-zinc-950/30 px-3 py-2 leading-relaxed transition-colors focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 ${meta.textarea}`}
                    />
                  )}

                  {showCollapsedOverlay && (
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-zinc-900/95 to-transparent" />
                  )}
                </div>

                {showReadMore && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsContentExpanded((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    {isContentExpanded ? '收起内容' : '展开全文'}
                    <svg className={`h-3 w-3 transition-transform ${isContentExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
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
            className="relative ml-4 space-y-3 pl-4 sm:ml-6 sm:pl-5"
          >
            <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-px bg-zinc-800/85" />
            {node.children!.map((child) => (
              <div key={child.id} className="relative">
                <div className="pointer-events-none absolute -left-4 top-7 h-px w-4 bg-zinc-800/85 sm:-left-5 sm:w-5" />
                <OutlineTreeNode
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
                  depth={depth + 1}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  emptyDescription = '请使用上方操作生成或续写大纲。',
}: OutlineTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-zinc-500 ${className}`}>
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800/80 bg-zinc-900/55">
          <svg className="h-8 w-8 opacity-55" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-base font-medium text-zinc-300">{emptyTitle}</p>
        <p className="mt-1 text-sm text-zinc-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="rounded-xl border border-zinc-800/75 bg-zinc-950/55 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span className="text-zinc-500">层级图例</span>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">L1 粗纲</span>
          <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">L2 细纲</span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">L3 章节纲</span>
          <span className="text-zinc-500">沿线展开可查看上下级关系</span>
        </div>
      </div>
      {nodes.map((node) => (
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
        />
      ))}
    </div>
  );
}

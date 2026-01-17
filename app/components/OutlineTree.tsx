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
}

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
  isLast = false
}: OutlineTreeNodeProps) => {
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  
  const effectiveLevel = node.level || 'rough';
  const isLeaf = effectiveLevel === 'chapter';
  const hasChildren = node.children && node.children.length > 0;
  
  const styles = {
    rough: {
      container: "mb-6 glass-panel rounded-xl border-l-4 border-l-emerald-500 overflow-hidden",
      header: "p-4 bg-white/5",
      title: "text-lg font-bold text-white",
      content: "p-4 bg-black/20 text-base",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    detailed: {
      container: "mb-3 bg-zinc-900/40 border border-white/5 rounded-lg border-l-2 border-l-emerald-500/30 ml-1 relative group",
      header: "p-3 hover:bg-white/5 transition-colors",
      title: "text-base font-semibold text-gray-200",
      content: "p-3 pl-10 text-sm bg-black/10",
      badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    },
    chapter: {
      container: "mb-2 ml-2 border-l border-gray-800 pl-3 relative hover:bg-white/5 rounded-r-lg transition-colors group",
      header: "py-2 pr-2 flex items-center",
      title: "text-sm font-medium text-gray-300 group-hover:text-white",
      content: "mt-2 text-xs text-gray-500 pl-2 border-l-2 border-gray-800",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    }
  };

  const currentStyle = styles[effectiveLevel];
  const levelLabel = effectiveLevel === 'rough' ? '粗纲' : effectiveLevel === 'detailed' ? '细纲' : '章节';
  const nextLevelName = effectiveLevel === 'rough' ? '细纲' : '章节';

  return (
    <div className={`relative ${effectiveLevel === 'rough' ? 'mb-8' : ''}`}>
      {effectiveLevel !== 'rough' && (
        <div className="absolute -left-4 top-4 w-4 h-px bg-gray-800" />
      )}
      
      <div 
        className={`
          transition-all duration-300 relative
          ${currentStyle.container}
          ${isSelected ? 'ring-2 ring-emerald-500/50 bg-emerald-500/5' : ''}
        `}
      >
        <div className={currentStyle.header}>
          <div className="flex items-start gap-3">
            {selectionMode && (
              <div className="pt-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => onSelect?.(node.id, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500/50"
                />
              </div>
            )}

            <button 
              onClick={() => onToggle(node.id)}
              className={`
                mt-1 w-5 h-5 flex items-center justify-center rounded-full 
                hover:bg-white/10 text-gray-400 hover:text-white transition-all
                ${!hasChildren && !isLeaf ? 'invisible' : ''}
              `}
            >
              {hasChildren ? (
                <svg 
                  className={`w-3 h-3 transform transition-transform duration-200 ${node.isExpanded ? 'rotate-90' : ''}`} 
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <div className={`w-1.5 h-1.5 rounded-full ${isLeaf ? 'bg-emerald-500/50' : 'bg-gray-600'}`} />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`font-mono text-xs opacity-50 ${effectiveLevel === 'rough' ? 'bg-white/10 px-1.5 py-0.5 rounded' : ''}`}>
                    {node.id}
                  </span>
                  <h4 className={`${currentStyle.title} truncate cursor-pointer`} onClick={() => setIsContentExpanded(!isContentExpanded)}>
                    {node.title}
                  </h4>
                  {effectiveLevel === 'rough' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-gray-400 uppercase tracking-wider">
                      ROUGH
                    </span>
                  )}
                </div>

                <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${effectiveLevel === 'rough' || effectiveLevel === 'detailed' || node.isGenerating ? 'opacity-100' : ''}`}>
                  {!readOnly && onRegenerate && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRegenerate(node); }}
                      disabled={node.isGenerating}
                      className="p-1.5 rounded-lg hover:bg-amber-500/20 text-gray-400 hover:text-amber-400 transition-colors"
                      title={`重新生成此${levelLabel}`}
                    >
                      {node.isGenerating ? (
                         <svg className="animate-spin w-4 h-4 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </button>
                  )}
                  
                  {!isLeaf && !readOnly && onGenerateNext && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onGenerateNext(node); }}
                      disabled={node.isGenerating}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-medium transition-all"
                    >
                      <span>生成{nextLevelName}</span>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div 
                className={`
                  relative group mt-1
                  ${isContentExpanded ? '' : 'max-h-[3.6em] overflow-hidden'} 
                  ${readOnly ? '' : 'cursor-text'}
                `}
                onClick={() => !isContentExpanded && setIsContentExpanded(true)}
              >
                {readOnly ? (
                   <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
                    {node.content}
                   </p>
                ) : (
                  <textarea
                    className="w-full bg-transparent text-gray-400 text-sm leading-relaxed resize-none focus:outline-none focus:text-gray-200 transition-colors placeholder-gray-600"
                    value={node.content}
                    onChange={(e) => onUpdateNode?.(node.id, e.target.value)}
                    rows={effectiveLevel === 'rough' ? 3 : 2}
                    placeholder={`请输入${levelLabel}内容...`}
                    style={{ height: isContentExpanded ? 'auto' : undefined }}
                  />
                )}
                
                {!isContentExpanded && node.content.length > 60 && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#18181b] to-transparent pointer-events-none" />
                )}
              </div>
              
              {node.content.length > 60 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsContentExpanded(!isContentExpanded); }}
                  className="mt-1 text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                >
                  {isContentExpanded ? '收起' : '展开全文'}
                  <svg className={`w-3 h-3 transform transition-transform ${isContentExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
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
            className="pl-2 border-l border-gray-800/50 ml-2 space-y-2"
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
  className = ''
}: OutlineTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-lg font-medium text-gray-400">暂无大纲数据</p>
        <p className="text-sm text-gray-600 mt-2">点击上方按钮生成大纲</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {nodes.map(node => (
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
        />
      ))}
    </div>
  );
}

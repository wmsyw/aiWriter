'use client';

import { useCallback } from 'react';

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
  onUpdateNode?: (id: string, content: string) => void;
  readOnly?: boolean;
}

const OutlineTreeNode = ({ 
  node, 
  onToggle, 
  onGenerateNext,
  onUpdateNode,
  readOnly = false
}: OutlineTreeNodeProps) => {
  const isLeaf = node.level === 'chapter';
  const padding = node.level === 'rough' ? 0 : node.level === 'detailed' ? 24 : 48;
  const nextLevelName = node.level === 'rough' ? '细纲' : '章节';
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="mb-2 transition-all duration-300">
      <div 
        className={`glass-panel p-4 rounded-xl flex items-start gap-3 hover:bg-white/5 transition-colors ${node.level === 'rough' ? 'border-l-2 border-emerald-500/50' : ''}`}
        style={{ marginLeft: padding }}
      >
        <button 
          onClick={() => onToggle(node.id)}
          className="mt-1 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          {hasChildren || !isLeaf ? (
            <span className={`transform transition-transform duration-200 inline-block ${node.isExpanded ? 'rotate-90' : ''}`}>▶</span>
          ) : <span className="w-2 h-2 rounded-full bg-gray-600"/>}
        </button>
        
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h4 className="font-bold text-gray-200 truncate flex-1">
              <span className="text-emerald-400 mr-2 font-mono text-sm">{node.id}</span>
              {node.title}
            </h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasChildren && <span className="text-green-400 text-sm">✓ 已展开</span>}
              {!isLeaf && !readOnly && onGenerateNext && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateNext(node); }}
                  disabled={node.isGenerating}
                  className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg transition-colors border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {node.isGenerating ? '生成中...' : `生成${nextLevelName}`}
                </button>
              )}
            </div>
          </div>
          <div className="relative group">
            {readOnly ? (
              <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                {node.content}
              </p>
            ) : (
              <textarea
                className="w-full bg-transparent text-sm text-gray-400 leading-relaxed resize-none focus:outline-none focus:text-gray-200 transition-colors"
                value={node.content}
                onChange={(e) => onUpdateNode?.(node.id, e.target.value)}
                rows={node.content.length > 100 ? 4 : 2}
              />
            )}
          </div>
        </div>
      </div>
      
      {node.isExpanded && hasChildren && (
        <div className="animate-fade-in mt-2">
          {node.children!.map(child => (
            <OutlineTreeNode 
              key={child.id} 
              node={child} 
              onToggle={onToggle}
              onGenerateNext={onGenerateNext}
              onUpdateNode={onUpdateNode}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface OutlineTreeProps {
  nodes: OutlineNode[];
  onGenerateNext?: (node: OutlineNode) => void;
  onUpdateNode?: (id: string, content: string) => void;
  onToggle: (id: string) => void;
  readOnly?: boolean;
  className?: string;
}

export default function OutlineTree({ 
  nodes, 
  onGenerateNext,
  onUpdateNode,
  onToggle,
  readOnly = false,
  className = ''
}: OutlineTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <span className="text-4xl mb-4 opacity-50">📝</span>
        <p>暂无大纲数据</p>
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
          onUpdateNode={onUpdateNode}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

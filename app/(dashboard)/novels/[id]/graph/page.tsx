'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import cytoscape from 'cytoscape';
import GlassCard from '@/app/components/ui/GlassCard';
import { Button } from '@/app/components/ui/Button';

interface GraphNode {
  data: {
    id: string;
    label: string;
    description?: string;
    traits?: string[];
  };
}

interface GraphEdge {
  data: {
    source: string;
    target: string;
    label: string;
  };
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const graphLayout: cytoscape.LayoutOptions = {
  name: 'cose',
  animate: true,
  randomize: true,
  nodeRepulsion: () => 8000,
  idealEdgeLength: () => 100,
};

export default function CharacterGraphPage() {
  const params = useParams();
  const novelId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode['data'] | null>(null);

  const stats = useMemo(
    () => ({
      nodes: graphData?.nodes.length ?? 0,
      edges: graphData?.edges.length ?? 0,
      traits: selectedNode?.traits?.length ?? 0,
    }),
    [graphData, selectedNode]
  );

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/character-graph`);
      if (!res.ok) throw new Error('加载关系图失败，请稍后重试');
      const data: GraphData = await res.json();
      setGraphData(data);
      setSelectedNode(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载关系图失败';
      setError(message);
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (!graphData || !containerRef.current) return;

    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements: [...graphData.nodes, ...graphData.edges],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#10b981',
            label: 'data(label)',
            color: '#f8fafc',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            width: 60,
            height: 60,
            'border-width': 1.5,
            'border-color': '#064e3b',
            'text-outline-color': '#0f172a',
            'text-outline-width': 2,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#475569',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            color: '#94a3b8',
            'font-size': '10px',
            'text-rotation': 'autorotate',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#14b8a6',
            'border-width': 3,
            'border-color': '#d1fae5',
          },
        },
      ],
      layout: graphLayout,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode(node.data());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;
    cy.fit(undefined, 48);

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData]);

  const handleRelayout = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout(graphLayout).run();
  };

  const handleFitView = () => {
    cyRef.current?.fit(undefined, 48);
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-5">
        <Link
          href={`/novels/${novelId}`}
          className="inline-flex items-center gap-2 w-fit text-sm font-medium text-zinc-400 hover:text-white transition-colors group"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] group-hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </span>
          返回小说
        </Link>

        <div className="page-header gap-4">
          <div>
            <h1 className="page-title">角色关系图谱</h1>
            <p className="page-subtitle">点击节点查看详情，使用工具按钮快速重排与缩放视图。</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              className="min-w-[98px]"
              onClick={handleFitView}
              disabled={!graphData || loading || !!error}
            >
              适配视图
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-w-[98px]"
              onClick={handleRelayout}
              disabled={!graphData || loading || !!error}
            >
              重新布局
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-[98px] border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
              onClick={() => setSelectedNode(null)}
              disabled={!selectedNode}
            >
              清空选中
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-emerald-300/80">角色节点</p>
            <p className="text-xl font-semibold text-emerald-200 mt-1">{stats.nodes}</p>
          </div>
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-cyan-300/80">关系连线</p>
            <p className="text-xl font-semibold text-cyan-200 mt-1">{stats.edges}</p>
          </div>
          <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/70 px-4 py-3 col-span-2 md:col-span-1">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400">已选特征数</p>
            <p className="text-xl font-semibold text-zinc-100 mt-1">{stats.traits}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <GlassCard className="relative overflow-hidden min-h-[560px] border border-white/10 bg-zinc-900/65">
          <div ref={containerRef} className="h-[560px] md:h-[640px] w-full rounded-xl" />

          {loading && (
            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="h-9 w-9 rounded-full border-2 border-emerald-400/30 border-t-emerald-300 animate-spin" />
              <p className="text-sm text-zinc-400">加载关系图中...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-4 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <Button variant="danger" size="sm" onClick={loadGraph}>
                重试加载
              </Button>
            </div>
          )}
        </GlassCard>

        <GlassCard className="border border-white/10 bg-zinc-900/70 p-5 md:p-6 min-h-[560px]">
          {selectedNode ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">当前选中</p>
                <h2 className="text-2xl font-semibold text-zinc-100">{selectedNode.label}</h2>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">角色简介</p>
                <p className="text-sm leading-relaxed text-zinc-300">
                  {selectedNode.description || '暂无描述信息。'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">性格特征</p>
                {selectedNode.traits && selectedNode.traits.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.traits.map((trait) => (
                      <span
                        key={trait}
                        className="inline-flex items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">暂无特征标签。</p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="h-14 w-14 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-zinc-300 font-medium">未选中节点</p>
              <p className="text-sm text-zinc-500 mt-2">点击左侧关系图中的任意角色节点查看详细信息。</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

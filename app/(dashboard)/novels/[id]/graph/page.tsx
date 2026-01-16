'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import cytoscape from 'cytoscape';

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

export default function CharacterGraphPage() {
  const params = useParams();
  const novelId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode['data'] | null>(null);

  useEffect(() => {
    async function loadGraph() {
      try {
        const res = await fetch(`/api/novels/${novelId}/character-graph`);
        if (!res.ok) throw new Error('Failed to load graph');
        const data: GraphData = await res.json();

        if (!containerRef.current) return;

        cyRef.current = cytoscape({
          container: containerRef.current,
          elements: [...data.nodes, ...data.edges],
          style: [
            {
              selector: 'node',
              style: {
                'background-color': '#10b981',
                'label': 'data(label)',
                'color': '#fff',
                'text-valign': 'center',
                'text-halign': 'center',
                'font-size': '12px',
                'width': 60,
                'height': 60,
              },
            },
            {
              selector: 'edge',
              style: {
                'width': 2,
                'line-color': '#94a3b8',
                'target-arrow-color': '#94a3b8',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'label': 'data(label)',
                'font-size': '10px',
                'text-rotation': 'autorotate',
              },
            },
            {
              selector: 'node:selected',
              style: {
                'background-color': '#ec4899',
                'border-width': 3,
                'border-color': '#fff',
              },
            },
          ],
          layout: {
            name: 'cose',
            animate: true,
            randomize: true,
            nodeRepulsion: () => 8000,
            idealEdgeLength: () => 100,
          },
        });

        cyRef.current.on('tap', 'node', (evt) => {
          const node = evt.target;
          setSelectedNode(node.data());
        });

        cyRef.current.on('tap', (evt) => {
          if (evt.target === cyRef.current) {
            setSelectedNode(null);
          }
        });

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    loadGraph();

    return () => {
      cyRef.current?.destroy();
    };
  }, [novelId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">加载角色关系图...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-500">错误: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold">角色关系图</h1>
        <p className="text-sm text-gray-500">点击角色节点查看详情</p>
      </div>
      
      <div className="flex-1 flex">
        <div ref={containerRef} className="flex-1 bg-gray-50" style={{ minHeight: '500px' }} />
        
        {selectedNode && (
          <div className="w-72 border-l p-4 bg-white">
            <h2 className="text-lg font-semibold mb-2">{selectedNode.label}</h2>
            {selectedNode.description && (
              <p className="text-sm text-gray-600 mb-3">{selectedNode.description}</p>
            )}
            {selectedNode.traits && selectedNode.traits.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">性格特征</h3>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.traits.map((trait, i) => (
                    <span key={i} className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

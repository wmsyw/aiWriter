'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import OutlineGeneratorModal from './OutlineGeneratorModal';
import OutlineTree from '@/app/components/OutlineTree';
import PlotBranchingView, { type PlotBranch } from '@/app/components/PlotBranchingView';
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent, 
  Button, 
  Card, 
  Badge, 
  Skeleton 
} from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ui/Modal';
import { 
  staggerContainer, 
  staggerItem, 
  fadeIn, 
  slideUp, 
  slideInRight 
} from '@/app/lib/animations';

interface ReviewFeedback {
  verdict?: 'approve' | 'minor_revision' | 'major_revision' | 'reject';
  overallScore?: number;
}

interface Chapter {
  id: string;
  title: string;
  wordCount: number;
  updatedAt: string;
  order: number;
  generationStage?: 'draft' | 'generated' | 'reviewed' | 'humanized' | 'approved';
  reviewFeedback?: ReviewFeedback;
  outlineAdherence?: number;
  lastReviewAt?: string;
}

interface OutlineNode {
  id: string;
  title: string;
  content: string;
  level: 'rough' | 'detailed' | 'chapter';
  children?: OutlineNode[];
  isExpanded?: boolean;
  isGenerating?: boolean;
}

interface Novel {
  id: string;
  title: string;
  description?: string;
  type?: 'long';
  outline?: string;
  outlineRough?: { blocks: OutlineNode[] };
  outlineDetailed?: { blocks: OutlineNode[] };
  outlineChapters?: { blocks: OutlineNode[] };
  outlineStage?: string;
  updatedAt: string;
  keywords?: string[];
  theme?: string;
  genre?: string;
  targetWords?: number;
  chapterCount?: number;
  protagonist?: string;
  worldSetting?: string;
  specialRequirements?: string;
}

interface BlockingInfo {
  hasBlocking: boolean;
  count: number;
}

interface WorkflowStats {
  unresolvedHooks: number;
  overdueHooks: number;
  pendingEntities: number;
}

const WORKFLOW_STEPS = [
  { id: 'draft', label: '草稿' },
  { id: 'generated', label: '已生成' },
  { id: 'reviewed', label: '已审查' },
  { id: 'humanized', label: '已润色' },
  { id: 'approved', label: '已定稿' },
] as const;

export default function NovelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chapters' | 'outline' | 'materials' | 'hooks' | 'entities' | 'settings' | 'plot'>('chapters');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedOutline, setEditedOutline] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOutlineGenerator, setShowOutlineGenerator] = useState(false);
  const [blockingInfo, setBlockingInfo] = useState<BlockingInfo>({ hasBlocking: false, count: 0 });
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats>({ unresolvedHooks: 0, overdueHooks: 0, pendingEntities: 0 });
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  
  const [plotBranches, setPlotBranches] = useState<PlotBranch[]>([]);
  const [isGeneratingPlot, setIsGeneratingPlot] = useState(false);
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [regeneratingOutline, setRegeneratingOutline] = useState<'rough' | 'detailed' | 'chapters' | null>(null);
  const [outlineSelectionMode, setOutlineSelectionMode] = useState(false);
  const [selectedOutlineIds, setSelectedOutlineIds] = useState<Set<string>>(new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: chapters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, 
    overscan: 5,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [novelRes, chaptersRes, blockingRes, hooksReportRes, entitiesRes] = await Promise.all([
          fetch(`/api/novels/${id}`),
          fetch(`/api/novels/${id}/chapters`),
          fetch(`/api/novels/${id}/pending-entities/blocking`),
          fetch(`/api/novels/${id}/hooks/report`),
          fetch(`/api/novels/${id}/pending-entities?status=pending`),
        ]);

        if (novelRes.ok) {
          const novelData = await novelRes.json();
          setNovel(novelData);
          setEditedTitle(novelData.title);
          setEditedDescription(novelData.description || '');
          setEditedOutline(novelData.outline || '');
          
          if (novelData.outlineRough?.blocks) {
            setOutlineNodes(novelData.outlineRough.blocks);
          } else if (novelData.outlineDetailed?.blocks) {
            setOutlineNodes(novelData.outlineDetailed.blocks);
          } else if (novelData.outlineChapters?.blocks) {
            setOutlineNodes(novelData.outlineChapters.blocks);
          }
        }
        
        if (chaptersRes.ok) {
          const chaptersData = await chaptersRes.json();
          setChapters(chaptersData.chapters || []);
        }

        if (blockingRes.ok) {
          const blockingData = await blockingRes.json();
          setBlockingInfo({ hasBlocking: blockingData.hasBlocking, count: blockingData.count });
        }

        if (hooksReportRes.ok) {
          const hooksData = await hooksReportRes.json();
          setWorkflowStats(prev => ({
            ...prev,
            unresolvedHooks: hooksData.stats?.unresolvedCount || 0,
            overdueHooks: hooksData.stats?.overdueCount || 0,
          }));
        }

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json();
          setWorkflowStats(prev => ({
            ...prev,
            pendingEntities: entitiesData.entities?.length || 0,
          }));
        }

      } catch (error) {
        console.error('Failed to fetch novel details', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleUpdateTitle = async () => {
    if (!editedTitle.trim() || editedTitle === novel?.title) {
      setIsEditingTitle(false);
      setEditedTitle(novel?.title || '');
      return;
    }

    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle }),
      });

      if (res.ok) {
        setNovel(prev => prev ? { ...prev, title: editedTitle } : null);
      } else {
        setError('更新标题失败');
      }
    } catch {
      setError('更新标题失败，请重试');
    }
    setIsEditingTitle(false);
  };

  const handleUpdateDescription = async () => {
    if (editedDescription === (novel?.description || '')) return;

    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editedDescription }),
      });

      if (!res.ok) {
        setError('更新简介失败');
      } else {
        setNovel(prev => prev ? { ...prev, description: editedDescription } : null);
      }
    } catch {
      setError('更新简介失败，请重试');
    }
  };

  const handleDeleteNovel = async () => {
    try {
      const res = await fetch(`/api/novels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/novels');
      } else {
        setError('删除小说失败');
      }
    } catch {
      setError('删除小说失败，请重试');
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    setConfirmState({
      isOpen: true,
      title: '删除章节',
      message: '确定要删除此章节吗？此操作不可撤销。',
      confirmText: '删除',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/novels/${id}/chapters/${chapterId}`, { method: 'DELETE' });
          if (res.ok) {
            setChapters(chapters.filter(c => c.id !== chapterId));
          } else {
            setError('删除章节失败');
          }
        } catch {
          setError('删除章节失败，请重试');
        }
      }
    });
  };

  const handleGeneratePlot = async () => {
    setIsGeneratingPlot(true);
    try {
      const currentChapter = chapters.length > 0 ? chapters[chapters.length - 1].order + 1 : 1;
      
      const res = await fetch(`/api/novels/${id}/plot-simulation?currentChapter=${currentChapter}`);
      if (res.ok) {
        const data = await res.json();
        setPlotBranches(data.branches || []);
      } else {
        setError('生成剧情推演失败');
      }
    } catch (e) {
      console.error(e);
      setError('生成剧情推演失败，请重试');
    } finally {
      setIsGeneratingPlot(false);
    }
  };

  const handleUpdateOutline = async () => {
    if (editedOutline === (novel?.outline || '')) return;
    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline: editedOutline }),
      });
      if (res.ok) {
        setNovel(prev => prev ? { ...prev, outline: editedOutline } : null);
      } else {
        setError('更新大纲失败');
      }
    } catch {
      setError('更新大纲失败，请重试');
    }
  };

  const handleCreateChapter = async () => {
    if (novel?.type === 'long' && !novel?.outline) {
      setError('长篇小说需要先创建大纲才能添加章节');
      setActiveTab('outline');
      return;
    }
    
    if (blockingInfo.hasBlocking) {
      setError(`无法生成新章节：有 ${blockingInfo.count} 个待确认实体阻碍生成流程。请先处理待确认实体。`);
      setActiveTab('entities');
      return;
    }

    try {
      const res = await fetch(`/api/novels/${id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `第 ${chapters.length + 1} 章`,
          order: chapters.length 
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChapters([...chapters, data.chapter]);
      } else {
        setError('创建章节失败');
      }
    } catch {
      setError('创建章节失败，请重试');
    }
  };

  const safeParseJSON = (text: string) => {
    try {
      const cleanText = text.replace(/```json\n|\n```/g, '').replace(/```/g, '').trim();
      const start = cleanText.indexOf('{');
      const end = cleanText.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      return JSON.parse(cleanText.substring(start, end + 1));
    } catch (e) {
      console.error('Failed to parse JSON', e);
      return null;
    }
  };

  const pollJobResult = (jobId: string) => new Promise<any>((resolve, reject) => {
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const { job } = await res.json();
        if (job.status === 'succeeded') {
          resolve(job.output);
          return;
        }
        if (job.status === 'failed') {
          reject(new Error(job.error || '生成失败'));
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (attempts < 300) {
        setTimeout(poll, 2000);
      } else {
        reject(new Error('生成超时 (超过10分钟)'));
      }
    };
    poll();
  });

  const runJob = async (type: string, input: Record<string, unknown>) => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, input }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.error 
        ? (Array.isArray(errorData.error) ? errorData.error.map((e: { message?: string }) => e.message).join(', ') : String(errorData.error))
        : '生成失败';
      throw new Error(errorMsg);
    }
    const { job } = await res.json();
    return pollJobResult(job.id);
  };

  const saveStructuredOutline = async (treeToSave: OutlineNode[]) => {
    if (!novel?.id) return;
    
    const serialized = treeToSave.map(node => {
      let text = `# ${node.title}\n${node.content}\n`;
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
           text += `## ${child.title}\n${child.content}\n`;
           if (child.children && child.children.length > 0) {
             child.children.forEach(grandChild => {
               text += `### ${grandChild.title}\n${grandChild.content}\n`;
             });
           }
        });
      }
      return text;
    }).join('\n\n');

    setEditedOutline(serialized);

    const hasDetailed = treeToSave.some(n => n.children && n.children.length > 0);
    const hasChapters = treeToSave.some(n => 
      n.children?.some(c => c.children && c.children.length > 0)
    );

    let outlineStage = 'none';
    if (hasChapters) {
      outlineStage = 'chapters';
    } else if (hasDetailed) {
      outlineStage = 'detailed';
    } else if (treeToSave.length > 0) {
      outlineStage = 'rough';
    }

    try {
      await fetch(`/api/novels/${novel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: serialized,
          outlineRough: treeToSave.length > 0 ? { blocks: treeToSave } : null,
          outlineStage,
        }),
      });
      setNovel(prev => prev ? { ...prev, outline: serialized, outlineStage } : null);
    } catch (error) {
      console.error('Failed to auto-save outline', error);
    }
  };

  const handleToggle = (id: string) => {
    setOutlineNodes(prev => {
      const toggleRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map(node => {
          if (node.id === id) {
            return { ...node, isExpanded: !node.isExpanded };
          }
          if (node.children && node.children.length > 0) {
            return { ...node, children: toggleRecursive(node.children) };
          }
          return node;
        });
      };
      return toggleRecursive(prev);
    });
  };

  const updateNodeChildren = (id: string, children: OutlineNode[]) => {
    setOutlineNodes(prev => {
      const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map(node => {
          if (node.id === id) {
            return { ...node, children, isExpanded: true, isGenerating: false };
          }
          if (node.children && node.children.length > 0) {
            return { ...node, children: updateRecursive(node.children) };
          }
          return node;
        });
      };
      return updateRecursive(prev);
    });
  };

  useEffect(() => {
    if (outlineNodes.length === 0) return;
    
    const timer = setTimeout(() => {
      saveStructuredOutline(outlineNodes);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [outlineNodes]);

  const setNodeGenerating = (id: string, isGenerating: boolean) => {
    const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isGenerating };
        }
        if (node.children && node.children.length > 0) {
          return { ...node, children: updateRecursive(node.children) };
        }
        return node;
      });
    };
    setOutlineNodes(prev => updateRecursive(prev));
  };

  const generateDetailedForBlock = async (node: OutlineNode) => {
    if (!novel?.id) return;
    setNodeGenerating(node.id, true);

    try {
      const roughNodes = outlineNodes.filter(n => n.level === 'rough');
      const currentIndex = roughNodes.findIndex(n => n.id === node.id);
      
      const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
      const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
      
      const context = roughNodes
        .map(n => `${n.id}. ${n.title}: ${n.content}`)
        .join('\n');

      const output = await runJob('OUTLINE_DETAILED', {
        novelId: novel.id,
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        rough_outline_context: context,
        prev_block_title: prevBlock?.title || '',
        prev_block_content: prevBlock?.content || '',
        next_block_title: nextBlock?.title || '',
        next_block_content: nextBlock?.content || '',
        targetWords: novel.targetWords,
        chapterCount: novel.chapterCount,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      if (json && json.children) {
        const normalizedChildren = json.children.map((child: any) => ({
          ...child,
          level: 'detailed' as const,
        }));
        updateNodeChildren(node.id, normalizedChildren);
      }
    } catch (error) {
      console.error('Failed to generate detailed outline', error);
      alert('生成细纲失败，请重试');
    } finally {
      setNodeGenerating(node.id, false);
    }
  };

  const generateChaptersForBlock = async (node: OutlineNode) => {
    if (!novel?.id) return;
    setNodeGenerating(node.id, true);

    try {
      const parentRough = outlineNodes.find(r => r.children?.some(c => c.id === node.id));
      
      const allDetailed = outlineNodes.flatMap(rough => rough.children || []);
      const context = allDetailed
        .map(detailed => `${detailed.id}. ${detailed.title}: ${detailed.content}`)
        .join('\n');

      const output = await runJob('OUTLINE_CHAPTERS', {
        novelId: novel.id,
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        detailed_outline_context: context,
        parent_rough_title: parentRough?.title || '',
        parent_rough_content: parentRough?.content || '',
        targetWords: novel.targetWords,
        chapterCount: novel.chapterCount,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      if (json && json.children) {
        const normalizedChildren = json.children.map((child: any) => ({
          ...child,
          level: 'chapter' as const,
        }));
        updateNodeChildren(node.id, normalizedChildren);
      }
    } catch (error) {
      console.error('Failed to generate chapters', error);
      alert('生成章节失败，请重试');
    } finally {
      setNodeGenerating(node.id, false);
    }
  };

  const handleGenerateNext = (node: OutlineNode) => {
    if (node.level === 'rough') {
      generateDetailedForBlock(node);
    } else if (node.level === 'detailed') {
      generateChaptersForBlock(node);
    }
  };

  const handleRegenerateSingleNode = async (node: OutlineNode) => {
    if (!novel?.id) return;
    
    const levelLabels = { rough: '粗纲', detailed: '细纲', chapter: '章节' };
    
    setConfirmState({
      isOpen: true,
      title: `重新生成此${levelLabels[node.level]}`,
      message: `确定要重新生成「${node.title}」吗？${node.children?.length ? '其下级节点也会被重新生成。' : ''}`,
      confirmText: '确认重新生成',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        setNodeGenerating(node.id, true);
        
        try {
          if (node.level === 'rough') {
            const roughNodes = outlineNodes.filter(n => n.level === 'rough');
            const currentIndex = roughNodes.findIndex(n => n.id === node.id);
            const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
            const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
            
            const output = await runJob('OUTLINE_ROUGH', {
              novelId: novel.id,
              keywords: novel.keywords?.join(',') || '',
              theme: novel.theme || '',
              genre: novel.genre || '',
              targetWords: novel.targetWords || 100,
              regenerate_single: true,
              target_id: node.id,
              target_title: node.title,
              target_content: node.content,
              prev_block_title: prevBlock?.title || '',
              prev_block_content: prevBlock?.content || '',
              next_block_title: nextBlock?.title || '',
              next_block_content: nextBlock?.content || '',
            });
            
            const newNode = output?.block || output;
            if (newNode) {
              setOutlineNodes(prev => prev.map(n => 
                n.id === node.id ? { ...n, ...newNode, level: 'rough', children: undefined } : n
              ));
            }
            
          } else if (node.level === 'detailed') {
            const allDetailed = outlineNodes.flatMap(r => r.children || []);
            const currentIndex = allDetailed.findIndex(n => n.id === node.id);
            const prevNode = currentIndex > 0 ? allDetailed[currentIndex - 1] : null;
            const nextNode = currentIndex < allDetailed.length - 1 ? allDetailed[currentIndex + 1] : null;
            
            const parentRough = outlineNodes.find(r => r.children?.some(c => c.id === node.id));
            
            const output = await runJob('OUTLINE_DETAILED', {
              novelId: novel.id,
              roughOutline: {},
              regenerate_single: true,
              target_id: node.id,
              target_title: node.title,
              target_content: node.content,
              rough_outline_context: parentRough ? `${parentRough.id}. ${parentRough.title}: ${parentRough.content}` : '',
              prev_block_title: prevNode?.title || '',
              prev_block_content: prevNode?.content || '',
              next_block_title: nextNode?.title || '',
              next_block_content: nextNode?.content || '',
              original_node_title: node.title,
            });
            
            const newNode = output?.node || output;
            if (newNode) {
              const updateDetailedNode = (nodes: OutlineNode[]): OutlineNode[] => {
                return nodes.map(n => {
                  if (n.id === node.id) {
                    return { ...n, ...newNode, level: 'detailed', children: undefined };
                  }
                  if (n.children) {
                    return { ...n, children: updateDetailedNode(n.children) };
                  }
                  return n;
                });
              };
              setOutlineNodes(prev => updateDetailedNode(prev));
            }
            
          } else if (node.level === 'chapter') {
            const allChapters = outlineNodes.flatMap(r => (r.children || []).flatMap(d => d.children || []));
            const currentIndex = allChapters.findIndex(n => n.id === node.id);
            const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
            const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;
            
            const parentDetailed = outlineNodes.flatMap(r => r.children || []).find(d => d.children?.some(c => c.id === node.id));
            
            const output = await runJob('OUTLINE_CHAPTERS', {
              novelId: novel.id,
              detailedOutline: {},
              regenerate_single: true,
              target_id: node.id,
              target_title: node.title,
              target_content: node.content,
              detailed_outline_context: parentDetailed ? `${parentDetailed.id}. ${parentDetailed.title}: ${parentDetailed.content}` : '',
              prev_chapter_title: prevChapter?.title || '',
              prev_chapter_content: prevChapter?.content || '',
              next_chapter_title: nextChapter?.title || '',
              next_chapter_content: nextChapter?.content || '',
              original_chapter_title: node.title,
            });
            
            const newNode = output?.chapter || output;
            if (newNode) {
              const updateChapterNode = (nodes: OutlineNode[]): OutlineNode[] => {
                return nodes.map(n => {
                  if (n.id === node.id) {
                    return { ...n, ...newNode, level: 'chapter' };
                  }
                  if (n.children) {
                    return { ...n, children: updateChapterNode(n.children) };
                  }
                  return n;
                });
              };
              setOutlineNodes(prev => updateChapterNode(prev));
            }
          }
        } catch (error) {
          console.error('Failed to regenerate node', error);
          alert('重新生成失败，请重试');
        } finally {
          setNodeGenerating(node.id, false);
        }
      },
    });
  };

  const handleOutlineSelect = (id: string, selected: boolean) => {
    setSelectedOutlineIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleBatchRegenerate = async () => {
    if (!novel?.id || selectedOutlineIds.size === 0) return;
    
    const findNodes = (nodes: OutlineNode[]): OutlineNode[] => {
      const result: OutlineNode[] = [];
      for (const node of nodes) {
        if (selectedOutlineIds.has(node.id)) {
          result.push(node);
        }
        if (node.children) {
          result.push(...findNodes(node.children));
        }
      }
      return result;
    };
    
    const selectedNodes = findNodes(outlineNodes);
    
    setConfirmState({
      isOpen: true,
      title: '批量重新生成',
      message: `确定要重新生成选中的 ${selectedNodes.length} 个节点吗？`,
      confirmText: '确认批量重新生成',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        
        for (const node of selectedNodes) {
          setNodeGenerating(node.id, true);
        }
        
        try {
          for (const node of selectedNodes) {
            await handleRegenerateSingleNodeInternal(node);
          }
        } finally {
          for (const node of selectedNodes) {
            setNodeGenerating(node.id, false);
          }
          setSelectedOutlineIds(new Set());
          setOutlineSelectionMode(false);
        }
      },
    });
  };

  const handleRegenerateSingleNodeInternal = async (node: OutlineNode) => {
    if (!novel?.id) return;
    
    try {
      if (node.level === 'rough') {
        const roughNodes = outlineNodes.filter(n => n.level === 'rough');
        const currentIndex = roughNodes.findIndex(n => n.id === node.id);
        const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
        const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
        
        const output = await runJob('OUTLINE_ROUGH', {
          novelId: novel.id,
          keywords: novel.keywords?.join(',') || '',
          theme: novel.theme || '',
          genre: novel.genre || '',
          targetWords: novel.targetWords || 100,
          regenerate_single: true,
          target_id: node.id,
          target_title: node.title,
          target_content: node.content,
          prev_block_title: prevBlock?.title || '',
          prev_block_content: prevBlock?.content || '',
          next_block_title: nextBlock?.title || '',
          next_block_content: nextBlock?.content || '',
        });
        
        const newNode = output?.block || output;
        if (newNode) {
          setOutlineNodes(prev => prev.map(n => 
            n.id === node.id ? { ...n, ...newNode, level: 'rough', children: undefined } : n
          ));
        }
      } else if (node.level === 'detailed') {
        const parentRough = outlineNodes.find(r => r.children?.some(c => c.id === node.id));
        
        const output = await runJob('OUTLINE_DETAILED', {
          novelId: novel.id,
          roughOutline: {},
          regenerate_single: true,
          target_id: node.id,
          target_title: node.title,
          target_content: node.content,
          rough_outline_context: parentRough ? `${parentRough.id}. ${parentRough.title}` : '',
          original_node_title: node.title,
        });
        
        const newNode = output?.node || output;
        if (newNode) {
          const updateDetailedNode = (nodes: OutlineNode[]): OutlineNode[] => {
            return nodes.map(n => {
              if (n.id === node.id) return { ...n, ...newNode, level: 'detailed', children: undefined };
              if (n.children) return { ...n, children: updateDetailedNode(n.children) };
              return n;
            });
          };
          setOutlineNodes(prev => updateDetailedNode(prev));
        }
      } else if (node.level === 'chapter') {
        const parentDetailed = outlineNodes.flatMap(r => r.children || []).find(d => d.children?.some(c => c.id === node.id));
        
        const output = await runJob('OUTLINE_CHAPTERS', {
          novelId: novel.id,
          detailedOutline: {},
          regenerate_single: true,
          target_id: node.id,
          target_title: node.title,
          target_content: node.content,
          detailed_outline_context: parentDetailed ? `${parentDetailed.id}. ${parentDetailed.title}` : '',
          original_chapter_title: node.title,
        });
        
        const newNode = output?.chapter || output;
        if (newNode) {
          const updateChapterNode = (nodes: OutlineNode[]): OutlineNode[] => {
            return nodes.map(n => {
              if (n.id === node.id) return { ...n, ...newNode, level: 'chapter' };
              if (n.children) return { ...n, children: updateChapterNode(n.children) };
              return n;
            });
          };
          setOutlineNodes(prev => updateChapterNode(prev));
        }
      }
    } catch (error) {
      console.error('Failed to regenerate node', node.id, error);
    }
  };

  const handleRegenerateOutline = async (type: 'rough' | 'detailed' | 'chapters') => {
    if (!novel) return;
    
    const typeLabels = { rough: '粗纲', detailed: '细纲', chapters: '章节纲' };
    
    setConfirmState({
      isOpen: true,
      title: `重新生成${typeLabels[type]}`,
      message: `确定要重新生成${typeLabels[type]}吗？这将覆盖现有的${typeLabels[type]}内容。${type === 'rough' ? '细纲和章节纲也会被重置。' : type === 'detailed' ? '章节纲也会被重置。' : ''}`,
      confirmText: '确认重新生成',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        setRegeneratingOutline(type);
        
        try {
          if (type === 'rough') {
            const roughOutput = await runJob('OUTLINE_ROUGH', {
              novelId: novel.id,
              keywords: novel.keywords?.join(',') || '',
              theme: novel.theme || '',
              genre: novel.genre || '',
              targetWords: novel.targetWords || 100,
              chapterCount: novel.chapterCount || 100,
              protagonist: novel.protagonist || '',
              worldSetting: novel.worldSetting || '',
              specialRequirements: novel.specialRequirements || '',
            });
            
            const blocks = roughOutput?.blocks || (Array.isArray(roughOutput) ? roughOutput : []);
            setOutlineNodes(blocks.map((b: any) => ({ ...b, level: 'rough', isExpanded: false })));
            setNovel(prev => prev ? { ...prev, outlineRough: { blocks }, outlineStage: 'rough' } : null);
            
          } else if (type === 'detailed') {
            const roughOutline = novel.outlineRough || { blocks: outlineNodes.filter(n => n.level === 'rough') };
            
            const detailedOutput = await runJob('OUTLINE_DETAILED', {
              novelId: novel.id,
              roughOutline,
              targetWords: novel.targetWords || 100,
              chapterCount: novel.chapterCount || 100,
            });
            
            const storyArcs = detailedOutput?.story_arcs || [];
            const updatedNodes = outlineNodes.map(node => {
              if (node.level !== 'rough') return node;
              const matchingArc = storyArcs.find((arc: any) => 
                arc.arc_id === node.id || arc.arc_title?.includes(node.title)
              );
              if (matchingArc?.children) {
                return { ...node, children: matchingArc.children.map((c: any) => ({ ...c, level: 'detailed' })), isExpanded: true };
              }
              return node;
            });
            setOutlineNodes(updatedNodes);
            setNovel(prev => prev ? { ...prev, outlineDetailed: detailedOutput, outlineStage: 'detailed' } : null);
            
          } else if (type === 'chapters') {
            const detailedOutline = novel.outlineDetailed || { 
              story_arcs: outlineNodes.map(n => ({
                arc_id: n.id,
                arc_title: n.title,
                children: n.children || []
              }))
            };
            
            const chaptersOutput = await runJob('OUTLINE_CHAPTERS', {
              novelId: novel.id,
              detailedOutline,
            });
            
            const events = chaptersOutput?.events || [];
            const updateWithChapters = (nodes: OutlineNode[]): OutlineNode[] => {
              return nodes.map(node => {
                if (node.level === 'detailed') {
                  const matchingEvent = events.find((e: any) => 
                    e.event_id === node.id || e.event_title?.includes(node.title)
                  );
                  if (matchingEvent?.children) {
                    return { ...node, children: matchingEvent.children.map((c: any) => ({ ...c, level: 'chapter' })), isExpanded: true };
                  }
                }
                if (node.children) {
                  return { ...node, children: updateWithChapters(node.children) };
                }
                return node;
              });
            };
            setOutlineNodes(prev => updateWithChapters(prev));
            setNovel(prev => prev ? { ...prev, outlineChapters: chaptersOutput, outlineStage: 'chapters' } : null);
          }
          
        } catch (error) {
          console.error(`Failed to regenerate ${type} outline`, error);
          alert(`重新生成${typeLabels[type]}失败，请重试`);
        } finally {
          setRegeneratingOutline(null);
        }
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-6">
          <Skeleton className="w-24 h-6" />
          <div className="flex items-start justify-between bg-white/5 p-6 rounded-3xl border border-white/5">
            <div className="flex-1 mr-8">
              <Skeleton className="w-32 h-6 mb-4" />
              <Skeleton className="w-96 h-12 mb-4" />
              <div className="flex gap-4">
                <Skeleton className="w-32 h-5" />
                <Skeleton className="w-24 h-5" />
              </div>
            </div>
            <Skeleton className="w-32 h-10 rounded-xl" />
          </div>
        </div>
        <div className="space-y-8">
          <div className="flex gap-4 border-b border-white/5 pb-0">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="w-24 h-12 rounded-t-xl" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <Skeleton className="w-48 h-8" />
              <Skeleton className="w-32 h-10" />
            </div>
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="w-full h-32 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 bg-gradient-to-br from-zinc-950 to-zinc-900">
        <h1 className="text-3xl font-bold text-white tracking-tight">未找到小说</h1>
        <p className="text-gray-400">该小说可能已被删除或不存在。</p>
        <Link href="/novels">
          <Button variant="secondary" leftIcon={<span className="group-hover:-translate-x-1 inline-block transition-transform">←</span>}>
             返回小说列表
          </Button>
        </Link>
      </div>
    );
  }

  const tabs = novel?.type === 'long' 
    ? ['chapters', 'outline', 'workbench', 'settings'] as const
    : ['chapters', 'workbench', 'settings'] as const;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {error && (
        <motion.div 
          initial="hidden" 
          animate="visible" 
          exit="exit" 
          variants={slideUp}
          className="fixed top-6 right-6 z-50 bg-red-500/90 text-white px-6 py-4 rounded-xl shadow-2xl shadow-red-500/20 flex items-center gap-4 backdrop-blur-md border border-red-400/20"
        >
          <div className="bg-white/20 p-2 rounded-full">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-medium">{error}</span>
          <button onClick={() => setError(null)} className="hover:bg-white/20 rounded-lg p-1.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
      
      <div className="flex flex-col gap-6 relative">
        <Link 
          href="/novels" 
          className="text-gray-400 hover:text-white flex items-center gap-2 w-fit transition-colors group text-sm font-medium"
        >
          <span className="bg-white/5 p-1.5 rounded-lg group-hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </span>
          返回列表
        </Link>

        <div className="flex items-start justify-between bg-white/5 p-6 rounded-3xl border border-white/5 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          
          <div className="flex-1 mr-8 relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Badge 
                variant="default" 
                className="bg-purple-500/20 text-purple-300 border-purple-500/20"
              >
                长篇小说
              </Badge>
              <span className="text-xs text-gray-500 font-mono">ID: {novel.id.slice(0, 8)}</span>
            </div>

            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleUpdateTitle}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                className="text-4xl md:text-5xl font-bold bg-white/10 border-b-2 border-emerald-500 rounded-lg px-3 py-1 w-full outline-none text-white placeholder-gray-500 focus:bg-white/15 transition-all"
                autoFocus
              />
            ) : (
              <h1 
                onClick={() => setIsEditingTitle(true)}
                className="text-4xl md:text-5xl font-bold text-white cursor-pointer hover:text-emerald-200 transition-colors group flex items-center gap-3"
                title="点击修改标题"
              >
                {novel.title}
                <svg className="w-5 h-5 opacity-0 group-hover:opacity-50 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </h1>
            )}
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {new Date(novel.updatedAt).toLocaleDateString()} 更新
              </span>
              <span className="w-1 h-1 bg-gray-600 rounded-full" />
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {chapters.length} 章节
              </span>
            </div>
          </div>

          <div className="relative z-10">
            <Button
              variant="secondary"
              onClick={() => setIsExportOpen(!isExportOpen)}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
              className="shadow-lg shadow-black/20"
            >
              导出作品
            </Button>
            
            {isExportOpen && (
              <motion.div 
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={fadeIn}
                className="absolute right-0 mt-2 w-48 glass-card rounded-xl overflow-hidden z-20 border border-white/10 shadow-xl shadow-black/50"
              >
                <button className="w-full text-left px-4 py-3 hover:bg-emerald-500/20 text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                  <span className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded">TXT</span>
                  纯文本格式
                </button>
                <button className="w-full text-left px-4 py-3 hover:bg-emerald-500/20 text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                  <span className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded">MD</span>
                  Markdown格式
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
          <TabsList variant="underline" className="overflow-x-auto no-scrollbar mask-linear-fade pb-0 mb-8 w-full justify-start">
            {tabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="text-lg gap-2.5 px-6">
                <span className="text-lg">
                  {tab === 'chapters' && '📚'}
                  {tab === 'outline' && '🗺️'}
                  {tab === 'workbench' && '🛠️'}
                  {tab === 'settings' && '⚙️'}
                </span>
                
                {tab === 'chapters' ? '章节列表' : tab === 'outline' ? '大纲规划' : tab === 'workbench' ? '创作工坊' : '高级设置'}
                
                {tab === 'workbench' && (workflowStats.overdueHooks > 0 || blockingInfo.hasBlocking) && (
                  <Badge variant="error" size="sm" className="ml-1 animate-pulse">
                    {(workflowStats.overdueHooks || 0) + (blockingInfo.hasBlocking ? blockingInfo.count : 0)}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="outline" key="outline">
              {novel?.type === 'long' && (
                <div className="max-w-5xl mx-auto space-y-6">
                  {outlineNodes.length > 0 && (
                    <Card className="p-6 md:p-8 rounded-3xl space-y-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            <span className="text-2xl">🌳</span>
                            大纲结构
                          </h3>
                          <p className="text-sm text-gray-400">
                            {novel.outlineStage === 'rough' && '粗纲阶段 - 可展开生成细纲'}
                            {novel.outlineStage === 'detailed' && '细纲阶段 - 可展开生成章节'}
                            {novel.outlineStage === 'chapters' && '章节大纲已完成'}
                            {(!novel.outlineStage || novel.outlineStage === 'none') && '已生成大纲'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {outlineSelectionMode ? (
                            <>
                              <span className="text-xs text-gray-400 mr-1">
                                已选 {selectedOutlineIds.size} 个
                              </span>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={handleBatchRegenerate}
                                disabled={selectedOutlineIds.size === 0}
                                className="text-xs px-3 py-1 h-7 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30"
                              >
                                批量重新生成
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setOutlineSelectionMode(false);
                                  setSelectedOutlineIds(new Set());
                                }}
                                className="text-xs px-2 py-1 h-7 text-gray-400 hover:text-white hover:bg-white/10"
                              >
                                取消
                              </Button>
                              <div className="w-px h-4 bg-gray-700 mx-1" />
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setOutlineSelectionMode(true)}
                                className="text-xs px-2 py-1 h-7 text-gray-400 hover:text-white hover:bg-white/10"
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                                批量选择
                              </Button>
                              <div className="w-px h-4 bg-gray-700 mx-1" />
                            </>
                          )}
                          <div className="flex items-center gap-1.5 mr-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRegenerateOutline('rough')}
                              disabled={regeneratingOutline !== null}
                              isLoading={regeneratingOutline === 'rough'}
                              className="text-xs px-2 py-1 h-7 text-gray-400 hover:text-white hover:bg-white/10"
                            >
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              粗纲
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRegenerateOutline('detailed')}
                              disabled={regeneratingOutline !== null || !novel?.outlineRough}
                              isLoading={regeneratingOutline === 'detailed'}
                              title={!novel?.outlineRough ? '需要先有粗纲才能重新生成细纲' : ''}
                              className="text-xs px-2 py-1 h-7 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40"
                            >
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              细纲
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRegenerateOutline('chapters')}
                              disabled={regeneratingOutline !== null || !novel?.outlineDetailed}
                              isLoading={regeneratingOutline === 'chapters'}
                              title={!novel?.outlineDetailed ? '需要先有细纲才能重新生成章节纲' : ''}
                              className="text-xs px-2 py-1 h-7 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40"
                            >
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              章节纲
                            </Button>
                          </div>
                          <Badge 
                            variant={novel.outlineStage === 'chapters' ? 'success' : 'info'}
                            className="px-3 py-1"
                          >
                            {outlineNodes.length} 个主节点
                          </Badge>
                        </div>
                      </div>
                      
                      <OutlineTree 
                        nodes={outlineNodes}
                        onGenerateNext={handleGenerateNext}
                        onRegenerate={handleRegenerateSingleNode}
                        onToggle={handleToggle}
                        onUpdateNode={(id, content) => {
                          const updateNodes = (nodes: OutlineNode[]): OutlineNode[] => {
                            return nodes.map(n => {
                              if (n.id === id) return { ...n, content };
                              if (n.children) return { ...n, children: updateNodes(n.children) };
                              return n;
                            });
                          };
                          setOutlineNodes(prev => updateNodes(prev));
                        }}
                        selectedIds={selectedOutlineIds}
                        onSelect={handleOutlineSelect}
                        selectionMode={outlineSelectionMode}
                        readOnly={false}
                      />
                    </Card>
                  )}
                  
                  {outlineNodes.length === 0 && (
                    <Card className="p-6 md:p-8 rounded-3xl space-y-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1">
                            小说大纲
                          </h3>
                          <p className="text-sm text-gray-400">
                            规划故事主线与核心节奏
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {!novel.outline && (
                            <span className="text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                              需要先创建大纲才能添加章节
                            </span>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowOutlineGenerator(true)}
                            leftIcon={
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            }
                            className="shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                          >
                            AI 智能生成
                          </Button>
                        </div>
                      </div>
                      <textarea
                        className="glass-input w-full px-6 py-5 rounded-2xl h-[500px] resize-none text-gray-200 leading-relaxed font-sans text-lg focus:ring-2 focus:ring-emerald-500/30 transition-all bg-black/20"
                        placeholder="在这里编写你的小说大纲...&#10;&#10;建议包含：&#10;- 故事主线&#10;- 主要角色&#10;- 章节规划&#10;- 关键情节点"
                        value={editedOutline}
                        onChange={(e) => setEditedOutline(e.target.value)}
                        onBlur={handleUpdateOutline}
                      />
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="chapters" key="chapters">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                    章节列表
                    {blockingInfo.hasBlocking && (
                      <Badge variant="error" className="px-2 py-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                        生成被阻塞
                      </Badge>
                    )}
                  </h2>
                  <Button
                    variant={blockingInfo.hasBlocking ? 'secondary' : 'primary'}
                    onClick={handleCreateChapter}
                    disabled={blockingInfo.hasBlocking}
                    title={blockingInfo.hasBlocking ? '请先处理待确认实体' : ''}
                    leftIcon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    }
                    className={blockingInfo.hasBlocking ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-white/5' : 'shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40'}
                  >
                    添加新章节
                  </Button>
                </div>

                {chapters.length > 0 ? (
                  <div 
                    ref={parentRef}
                    className="h-[70vh] overflow-y-auto rounded-xl scrollbar-hide"
                    style={{ contain: 'strict' }}
                  >
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const chapter = chapters[virtualItem.index];
                        return (
                          <div
                            key={chapter.id}
                            data-index={virtualItem.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualItem.start}px)`,
                              paddingBottom: '16px',
                            }}
                          >
                            <Card 
                              variant="interactive"
                              className="p-5 flex flex-col md:flex-row md:items-center gap-6 group hover:border-emerald-500/30 transition-all duration-300 hover:bg-white/[0.07]"
                            >
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="text-gray-600 cursor-move p-2 hover:bg-white/5 rounded-lg transition-colors hidden md:block">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                  </svg>
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-xs font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">#{chapter.order + 1}</span>
                                    <h3 className="text-white font-bold truncate text-lg group-hover:text-emerald-400 transition-colors">
                                      {chapter.title}
                                    </h3>
                                  </div>
                                  
                                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm text-gray-400">
                                    <span className="flex items-center gap-1.5">
                                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                       {new Date(chapter.updatedAt).toLocaleDateString()}
                                    </span>
                                    <Badge variant="outline" className={
                                      (chapter.wordCount || 0) > 2000 
                                        ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5'
                                        : 'border-gray-700 text-gray-500 bg-gray-800/50'
                                    }>
                                      {chapter.wordCount || 0} 字
                                    </Badge>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 w-full md:w-64">
                                <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                                  <span>进度</span>
                                  <span className={`font-medium ${
                                    chapter.generationStage === 'approved' ? 'text-emerald-400' : 
                                    chapter.generationStage === 'humanized' ? 'text-purple-400' :
                                    'text-emerald-400'
                                  }`}>
                                    {WORKFLOW_STEPS.find(s => s.id === chapter.generationStage)?.label || '草稿'}
                                  </span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
                                  {WORKFLOW_STEPS.map((step, idx) => {
                                    const currentStageIdx = WORKFLOW_STEPS.findIndex(s => s.id === (chapter.generationStage || 'draft'));
                                    const isCompleted = idx <= currentStageIdx;
                                    const isCurrent = idx === currentStageIdx;
                                    const isLastStep = idx === WORKFLOW_STEPS.length - 1;
                                    
                                    return (
                                      <div 
                                        key={step.id} 
                                        className={`flex-1 transition-all duration-500 ${
                                          isCompleted 
                                            ? isLastStep
                                              ? 'bg-emerald-500'
                                              : 'bg-emerald-500'
                                            : 'bg-transparent'
                                        } ${isCurrent && !isCompleted ? 'animate-pulse' : ''} border-r border-black/20 last:border-0`}
                                        title={step.label}
                                      />
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6 justify-end">
                                <Link
                                  href={`/novels/${id}/chapters/${chapter.id}`}
                                >
                                  <Button variant="primary" size="sm" leftIcon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  }>
                                    <span className="hidden md:inline">编辑</span>
                                  </Button>
                                </Link>
                                <button
                                  onClick={() => handleDeleteChapter(chapter.id)}
                                  className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                                  title="删除章节"
                                  aria-label="删除章节"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <Card className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02] flex flex-col items-center justify-center gap-4 group hover:border-emerald-500/20 hover:bg-white/[0.04] transition-all">
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <span className="text-4xl">📝</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">暂无章节</h3>
                      <p className="text-gray-400 mb-6 max-w-sm">开始你的创作之旅，添加第一个章节或让 AI 为你生成。</p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleCreateChapter}
                      leftIcon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      }
                      className="shadow-lg shadow-emerald-500/20"
                    >
                      创建你的第一章
                    </Button>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="workbench" key="workbench">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-8 rounded-3xl relative overflow-hidden group border border-white/5 hover:border-emerald-500/30 transition-all bg-white/[0.02] flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shadow-inner shadow-emerald-500/20">
                        <span className="text-2xl">📦</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">素材库</h3>
                        <p className="text-sm text-gray-400">管理角色、设定与物品</p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-gray-400 mb-6 text-sm line-clamp-2 flex-grow">
                    结构化整理角色、地点、情节要点和世界观设定，让 AI 更好地理解你的故事世界。
                  </p>
                  
                  <Link href={`/novels/${id}/materials`} className="block mt-auto">
                    <Button variant="secondary" className="w-full gap-2 group/btn justify-between">
                      进入素材库
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </Button>
                  </Link>
                </Card>

                <Card className="p-8 rounded-3xl relative overflow-hidden group border border-white/5 hover:border-orange-500/30 transition-all bg-white/[0.02] flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center shadow-inner shadow-orange-500/20">
                        <span className="text-2xl">🎣</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">钩子管理</h3>
                        <p className="text-sm text-gray-400">伏笔、悬念与剧情回收</p>
                      </div>
                    </div>
                    {workflowStats.overdueHooks > 0 && (
                      <Badge variant="error" className="animate-pulse">
                        {workflowStats.overdueHooks} 个逾期
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6 flex-grow">
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                      <div className="text-xl font-bold text-white">{workflowStats.unresolvedHooks}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">未解决</div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                      <div className="text-xl font-bold text-emerald-400">--%</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">解决率</div>
                    </div>
                  </div>
                  
                  <Link href={`/novels/${id}/hooks`} className="block mt-auto">
                    <Button variant="secondary" className="w-full gap-2 group/btn justify-between">
                      管理钩子
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </Button>
                  </Link>
                </Card>

                <Card className={`p-8 rounded-3xl relative overflow-hidden group border transition-all bg-white/[0.02] flex flex-col ${blockingInfo.hasBlocking ? 'border-red-500/30 hover:border-red-500/50' : 'border-white/5 hover:border-purple-500/30'}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${blockingInfo.hasBlocking ? 'from-red-500/5 to-orange-500/5' : 'from-purple-500/5 to-emerald-500/5'} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${blockingInfo.hasBlocking ? 'bg-red-500/10 shadow-red-500/20' : 'bg-purple-500/10 shadow-purple-500/20'}`}>
                        <span className="text-2xl">👥</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">待确认实体</h3>
                        <p className="text-sm text-gray-400">AI 提取的新角色与组织</p>
                      </div>
                    </div>
                    {blockingInfo.hasBlocking && (
                      <Badge variant="error" className="animate-pulse">
                        阻塞生成
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex-grow">
                    {blockingInfo.hasBlocking ? (
                      <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <p className="text-red-300/90 text-sm">
                          有 <span className="font-bold text-white">{blockingInfo.count}</span> 个待确认实体阻碍生成。
                        </p>
                      </div>
                    ) : (
                      <div className="mb-6 flex items-center gap-3">
                        <div className="text-3xl font-bold text-white">{workflowStats.pendingEntities}</div>
                        <div className="text-sm text-gray-500">个待处理项目</div>
                      </div>
                    )}
                  </div>
                  
                  <Link href={`/novels/${id}/pending-entities`} className="block mt-auto">
                    <Button 
                      variant={blockingInfo.hasBlocking ? 'danger' : 'secondary'}
                      className="w-full gap-2 group/btn justify-between"
                    >
                      {blockingInfo.hasBlocking ? '解决阻塞' : '进入队列'}
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </Button>
                  </Link>
                </Card>

                <Card className="p-8 rounded-3xl relative overflow-hidden group border border-white/5 hover:border-blue-500/30 transition-all bg-white/[0.02] flex flex-col">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  <div className="flex items-start justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shadow-inner shadow-blue-500/20">
                        <span className="text-2xl">🔮</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">剧情推演</h3>
                        <p className="text-sm text-gray-400">预测未来剧情走向 (Beta)</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-grow">
                    {plotBranches.length > 0 ? (
                       <div className="mb-6">
                          <PlotBranchingView branches={plotBranches} />
                       </div>
                    ) : (
                      <div className="mb-6 text-sm text-gray-400 flex items-center">
                        点击推演，系统将分析当前剧情并预测 3 条发展路线。
                      </div>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={handleGeneratePlot}
                    disabled={isGeneratingPlot}
                    isLoading={isGeneratingPlot}
                    className="w-full gap-2 group/btn justify-between mt-auto"
                  >
                    开始推演
                    <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                  </Button>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings" key="settings">
              <div className="max-w-3xl mx-auto">
                <Card className="p-8 rounded-3xl space-y-8">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-emerald-500 rounded-full"/>
                      常规设置
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">标题</label>
                        <input 
                          type="text" 
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">简介</label>
                        <textarea 
                          className="glass-input w-full px-4 py-3 rounded-xl h-32 resize-none focus:border-emerald-500/50 transition-colors"
                          placeholder="添加简介..."
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          onBlur={handleUpdateDescription}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-white/10">
                    <h3 className="text-xl font-bold text-red-400 mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-red-500 rounded-full"/>
                      危险区域
                    </h3>
                    <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-white font-medium mb-1">删除小说</h4>
                        <p className="text-sm text-gray-400">
                          一旦删除，所有章节、素材和设定都将永久丢失，无法恢复。
                        </p>
                      </div>
                      <Button 
                        variant="danger"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="whitespace-nowrap"
                      >
                        删除小说
                      </Button>
                    </div>
                  </div>

                  {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                      <Card className="p-8 rounded-3xl max-w-md w-full mx-4 space-y-6 border-red-500/30 shadow-xl shadow-red-900/20 animate-scale-in">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-3xl">
                          ⚠️
                        </div>
                        <div className="text-center">
                          <h3 className="text-2xl font-bold text-white mb-2">确认删除</h3>
                          <p className="text-gray-400">
                            确定要删除《<span className="text-white font-bold">{novel.title}</span>》吗？<br/>
                            此操作<span className="text-red-400 font-bold">不可撤销</span>。
                          </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <Button 
                            variant="secondary"
                            onClick={() => setShowDeleteConfirm(false)}
                            className="flex-1"
                          >
                            取消
                          </Button>
                          <Button 
                            variant="danger"
                            onClick={handleDeleteNovel}
                            className="flex-1 shadow-lg shadow-red-500/30 bg-red-500 hover:bg-red-600 text-white"
                          >
                            确认删除
                          </Button>
                        </div>
                      </Card>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </div>

      <OutlineGeneratorModal
        isOpen={showOutlineGenerator}
        onClose={() => setShowOutlineGenerator(false)}
        novelId={novel?.id || ''}
        onGenerated={(data) => {
          setNovel(prev => prev ? { 
            ...prev, 
            outline: data.outline,
            outlineRough: data.outlineRough as { blocks: OutlineNode[] } | undefined,
            outlineDetailed: data.outlineDetailed as { blocks: OutlineNode[] } | undefined,
            outlineChapters: data.outlineChapters as { blocks: OutlineNode[] } | undefined,
          } : null);
          setEditedOutline(data.outline);
          if (data.outlineChapters && typeof data.outlineChapters === 'object' && 'blocks' in (data.outlineChapters as any)) {
            setOutlineNodes((data.outlineChapters as any).blocks);
          } else if (data.outlineDetailed && typeof data.outlineDetailed === 'object' && 'blocks' in (data.outlineDetailed as any)) {
            setOutlineNodes((data.outlineDetailed as any).blocks);
          }
          setShowOutlineGenerator(false);
        }}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
      />
    </div>
  );
}

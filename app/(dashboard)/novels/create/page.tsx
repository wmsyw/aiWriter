'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/app/components/ui/Select';

const GENRES = ['玄幻', '仙侠', '都市', '历史', '科幻', '游戏', '悬疑', '奇幻', '武侠', '言情', '其他'];
const OUTLINE_MODES = [
  { id: 'simple', label: '简版大纲' },
  { id: 'detailed', label: '详细大纲' },
];

const INSPIRATION_PRESETS = [
  {
    name: '废柴逆袭',
    theme: '成长与逆袭',
    genre: '玄幻',
    keywords: ['废柴', '奇遇', '逆天改命'],
    protagonist: '天赋低微却意志坚定的少年',
    worldSetting: '强者为尊的修炼大陆',
  },
  {
    name: '都市热血',
    theme: '都市争霸',
    genre: '都市',
    keywords: ['商战', '兄弟', '崛起'],
    protagonist: '从底层打拼的青年',
    worldSetting: '高速变革的现代都市',
  },
  {
    name: '星际冒险',
    theme: '探索与自由',
    genre: '科幻',
    keywords: ['星际', '文明', '远征'],
    protagonist: '被命运选中的探索者',
    worldSetting: '多文明共存的星际联邦',
  },
  {
    name: '江湖风云',
    theme: '恩怨与成长',
    genre: '武侠',
    keywords: ['门派', '江湖', '侠义'],
    protagonist: '被卷入江湖纷争的侠客',
    worldSetting: '门派林立的江湖世界',
  },
];

interface OutlineNode {
  id: string;
  title: string;
  content: string;
  level: 'rough' | 'detailed' | 'chapter';
  children: OutlineNode[];
  isExpanded?: boolean;
  isGenerating?: boolean;
}

const OutlineTreeNode = ({ 
  node, 
  onToggle, 
  onGenerateNext,
  onUpdate
}: { 
  node: OutlineNode; 
  onToggle: (id: string) => void;
  onGenerateNext: (node: OutlineNode) => void;
  onUpdate: (id: string, content: string) => void;
}) => {
  const isLeaf = node.level === 'chapter';
  const padding = node.level === 'rough' ? 0 : node.level === 'detailed' ? 24 : 48;
  const nextLevelName = node.level === 'rough' ? '细纲' : '章节';

  return (
    <div className="mb-2 transition-all duration-300">
      <div 
        className={`glass-panel p-4 rounded-xl flex items-start gap-3 hover:bg-white/5 transition-colors ${node.level === 'rough' ? 'border-indigo-500/30' : ''}`}
        style={{ marginLeft: padding }}
      >
        <button 
          onClick={() => onToggle(node.id)}
          className="mt-1 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          {(node.children && node.children.length > 0) || !isLeaf ? (
            <span className={`transform transition-transform duration-200 inline-block ${node.isExpanded ? 'rotate-90' : ''}`}>▶</span>
          ) : <span className="w-2 h-2 rounded-full bg-gray-600"/>}
        </button>
        
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h4 className="font-bold text-gray-200 truncate flex-1">
              <span className="text-indigo-400 mr-2">{node.id}</span>
              {node.title}
            </h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              {node.children && node.children.length > 0 && <span className="text-green-400">✓</span>}
              {!isLeaf && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateNext(node); }}
                  disabled={node.isGenerating}
                  className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2 py-1 rounded transition-colors border border-indigo-500/30 disabled:opacity-50"
                >
                  {node.isGenerating ? '生成中...' : `生成${nextLevelName}`}
                </button>
              )}
            </div>
          </div>
          <div className="relative group">
            <textarea
              className="w-full bg-transparent text-sm text-gray-400 leading-relaxed resize-none focus:outline-none focus:text-gray-200 transition-colors"
              value={node.content}
              onChange={(e) => onUpdate(node.id, e.target.value)}
              rows={node.content.length > 100 ? 4 : 2}
            />
          </div>
        </div>
      </div>
      
      {node.isExpanded && node.children && node.children.length > 0 && (
        <div className="animate-fade-in mt-2">
          {node.children.map(child => (
            <OutlineTreeNode 
              key={child.id} 
              node={child} 
              onToggle={onToggle}
              onGenerateNext={onGenerateNext}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function NovelWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetTitle = searchParams.get('title') || '';
  const presetDescription = searchParams.get('description') || '';
  const presetType = (searchParams.get('type') as 'short' | 'long') || 'long';

  const [step, setStep] = useState(0);
  const [novelId, setNovelId] = useState<string | null>(searchParams.get('novelId'));
  const [isSaving, setIsSaving] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [seedOutput, setSeedOutput] = useState<any>(null);
  const [roughOutline, setRoughOutline] = useState<any>(null);
  const [detailedOutline, setDetailedOutline] = useState<any>(null);
  const [chapterOutline, setChapterOutline] = useState<any>(null);
  const [generatedOutline, setGeneratedOutline] = useState('');
  const [worldBuildingLoading, setWorldBuildingLoading] = useState(false);
  const [characterLoading, setCharacterLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    title: presetTitle,
    description: presetDescription,
    type: presetType,
    theme: '',
    genre: '',
    targetWords: 200,
    chapterCount: 100,
    protagonist: '',
    worldSetting: '',
    goldenFinger: '',
    keywords: [] as string[],
    keywordsInput: '',
    specialRequirements: '',
    outlineMode: 'simple',
  });

  const [outlineTree, setOutlineTree] = useState<OutlineNode[]>([]);
  const stepLabels = ['基础设定', '核心设定', '粗略大纲', '大纲细化', '完成'];

  // Helper to parse JSON from AI response
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

  const toggleNode = (id: string) => {
    const toggleRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        if (node.children.length > 0) {
          return { ...node, children: toggleRecursive(node.children) };
        }
        return node;
      });
    };
    setOutlineTree(prev => toggleRecursive(prev));
  };

  const updateNodeChildren = (id: string, children: OutlineNode[]) => {
    const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, children, isExpanded: true, isGenerating: false };
        }
        if (node.children.length > 0) {
          return { ...node, children: updateRecursive(node.children) };
        }
        return node;
      });
    };
    setOutlineTree(prev => updateRecursive(prev));
  };

  const setNodeGenerating = (id: string, isGenerating: boolean) => {
    const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isGenerating };
        }
        if (node.children.length > 0) {
          return { ...node, children: updateRecursive(node.children) };
        }
        return node;
      });
    };
    setOutlineTree(prev => updateRecursive(prev));
  };

  const updateNodeContent = (id: string, content: string) => {
    const updateRecursive = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, content };
        }
        if (node.children.length > 0) {
          return { ...node, children: updateRecursive(node.children) };
        }
        return node;
      });
    };
    setOutlineTree(prev => updateRecursive(prev));
  };

  useEffect(() => () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
  }, []);

  const keywordsDisplay = useMemo(() => formData.keywords.join('、'), [formData.keywords]);

  const setField = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: typeof INSPIRATION_PRESETS[number]) => {
    setFormData(prev => ({
      ...prev,
      theme: preset.theme,
      genre: preset.genre,
      protagonist: preset.protagonist,
      worldSetting: preset.worldSetting,
      keywords: preset.keywords,
      keywordsInput: preset.keywords.join(', '),
    }));
  };

  const persistWizardStep = async (nextStep: number, overrideStatus?: 'draft' | 'in_progress' | 'completed') => {
    if (!novelId) {
      setStep(nextStep);
      return;
    }
    try {
      await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wizardStatus: overrideStatus || (nextStep >= 4 ? 'completed' : 'in_progress'),
          wizardStep: nextStep,
        }),
      });
    } catch (error) {
      console.error('Failed to persist wizard step', error);
    } finally {
      setStep(nextStep);
    }
  };

  const saveNovel = async (advanceStep: boolean = true) => {
    if (!formData.title.trim()) return null;
    setIsSaving(true);
    setJobStatus('保存基础信息中...');

    const normalizedKeywords = formData.keywordsInput
      ? formData.keywordsInput.split(',').map(item => item.trim()).filter(Boolean)
      : formData.keywords;

    const payload = {
      title: formData.title,
      description: formData.description,
      type: formData.type,
      theme: formData.theme || undefined,
      genre: formData.genre || undefined,
      targetWords: formData.targetWords || undefined,
      chapterCount: formData.chapterCount || undefined,
      protagonist: formData.protagonist || undefined,
      worldSetting: formData.worldSetting || undefined,
      keywords: normalizedKeywords,
      specialRequirements: formData.specialRequirements || undefined,
      outlineMode: formData.outlineMode,
      inspirationData: normalizedKeywords.length ? { keywords: normalizedKeywords } : undefined,
    };

    let currentNovelId = novelId;

    try {
      if (currentNovelId) {
        const res = await fetch(`/api/novels/${currentNovelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('保存失败');
      } else {
        const res = await fetch('/api/novels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('创建失败');
        const data = await res.json();
        currentNovelId = data.novel?.id || null;
        setNovelId(currentNovelId);
      }
      
      if (advanceStep) {
        await persistWizardStep(1, 'in_progress');
      }
      return currentNovelId;
    } catch (error) {
      console.error('Failed to save novel', error);
      return null;
    } finally {
      setIsSaving(false);
      setJobStatus('');
    }
  };

  const handleSaveBasicInfo = () => saveNovel(true);

  const pollJob = async (jobId: string, onSuccess: (output: any) => void) => {
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const { job } = await res.json();
        if (job.status === 'succeeded') {
          onSuccess(job.output);
          return;
        }
        if (job.status === 'failed') {
          setJobStatus(job.error || '生成失败');
          return;
        }
      } catch (error) {
        console.error('Failed to poll job', error);
      }
      if (attempts < 60) {
        pollTimerRef.current = setTimeout(poll, 2000);
      }
    };
    poll();
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
        pollTimerRef.current = setTimeout(poll, 2000);
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

  const startWorldBuilding = async (overrideId?: string) => {
    const idToUse = overrideId || novelId;
    if (!idToUse) return;
    setWorldBuildingLoading(true);
    try {
      const keywordsArray = formData.keywords.length > 0 
        ? formData.keywords 
        : formData.keywordsInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const output = await runJob('WIZARD_WORLD_BUILDING', {
        novelId: idToUse,
        theme: formData.theme,
        genre: formData.genre,
        keywords: keywordsArray,
        protagonist: formData.protagonist,
        worldSetting: formData.worldSetting,
        specialRequirements: formData.specialRequirements,
      });
      if (output && output.world_setting) {
        setField('worldSetting', output.world_setting);
      }
    } catch (error) {
      console.error('Failed to generate world setting', error);
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setWorldBuildingLoading(false);
    }
  };

  const startCharacterGeneration = async (overrideId?: string) => {
    const idToUse = overrideId || novelId;
    if (!idToUse) return;
    setCharacterLoading(true);
    try {
      const keywordsArray = formData.keywords.length > 0 
        ? formData.keywords 
        : formData.keywordsInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const output = await runJob('WIZARD_CHARACTERS', {
        novelId: idToUse,
        theme: formData.theme,
        genre: formData.genre,
        keywords: keywordsArray,
        protagonist: formData.protagonist,
        worldSetting: formData.worldSetting,
        characterCount: 1,
      });
      if (output && output.characters && output.characters.length > 0) {
        const char = output.characters[0];
        const desc = `姓名：${char.name}\n定位：${char.role}\n描述：${char.description}\n性格：${char.traits}\n目标：${char.goals}`;
        setField('protagonist', desc);
      }
    } catch (error) {
      console.error('Failed to generate character', error);
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setCharacterLoading(false);
    }
  };

  const handleGenerateWorldSetting = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }
    const id = await saveNovel(false);
    if (id) {
      await startWorldBuilding(id);
    }
  };

  const handleGenerateCharacter = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }
    const id = await saveNovel(false);
    if (id) {
      await startCharacterGeneration(id);
    }
  };

  const startNovelSeed = async () => {
    if (!novelId) return;
    setJobStatus('生成核心设定中...');

    try {
      const output = await runJob('NOVEL_SEED', {
        novelId,
        title: formData.title,
        theme: formData.theme,
        genre: formData.genre,
        keywords: formData.keywordsInput || formData.keywords.join(', '),
        protagonist: formData.protagonist,
        specialRequirements: formData.specialRequirements,
      });

      const world = output?.world || {};
      setSeedOutput(output);
      setFormData(prev => ({
        ...prev,
        description: output?.synopsis || prev.description,
        protagonist: output?.protagonist || prev.protagonist,
        goldenFinger: output?.golden_finger || prev.goldenFinger,
        worldSetting: world.world_setting || prev.worldSetting,
      }));
      setJobStatus('');
    } catch (error) {
      console.error('Failed to generate seed data', error);
      setJobStatus(error instanceof Error ? error.message : '生成失败');
    }
  };

  const startRoughOutline = async () => {
    if (!novelId) return;
    setJobStatus('生成粗略大纲中...');

    try {
      const output = await runJob('OUTLINE_ROUGH', {
        novelId,
        keywords: formData.keywordsInput || formData.keywords.join(', '),
        theme: formData.theme,
        genre: formData.genre,
        targetWords: formData.targetWords,
        chapterCount: formData.chapterCount,
        protagonist: formData.protagonist,
        worldSetting: formData.worldSetting,
        specialRequirements: formData.specialRequirements,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      if (json && json.blocks) {
        setOutlineTree(json.blocks);
      } else {
        // Fallback or error handling
        console.warn('Unexpected output format:', output);
      }
      setJobStatus('');
    } catch (error) {
      console.error('Failed to generate rough outline', error);
      setJobStatus(error instanceof Error ? error.message : '生成失败');
    }
  };

  const generateDetailedForBlock = async (node: OutlineNode) => {
    if (!novelId) return;
    setNodeGenerating(node.id, true);

    try {
      // Build context from rough outline nodes
      const context = outlineTree
        .filter(n => n.level === 'rough')
        .map(n => `${n.id}. ${n.title}: ${n.content}`)
        .join('\n');

      const output = await runJob('OUTLINE_DETAILED', {
        novelId,
        roughOutline: {}, // Schema requirement
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        rough_outline_context: context,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      if (json && json.children) {
        updateNodeChildren(node.id, json.children);
      }
    } catch (error) {
      console.error('Failed to generate detailed outline', error);
      alert('生成细纲失败，请重试');
    } finally {
      setNodeGenerating(node.id, false);
    }
  };

  const generateChaptersForBlock = async (node: OutlineNode) => {
    if (!novelId) return;
    setNodeGenerating(node.id, true);

    try {
      // Build context from available detailed nodes
      const context = outlineTree
        .flatMap(rough => rough.children || [])
        .map(detailed => `${detailed.id}. ${detailed.title}`)
        .join('\n');

      const output = await runJob('OUTLINE_CHAPTERS', {
        novelId,
        detailedOutline: {}, // Schema requirement
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        detailed_outline_context: context,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      if (json && json.children) {
        updateNodeChildren(node.id, json.children);
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


  const applyOutline = async () => {
    if (!novelId) return;
    setIsSaving(true);
    
    const serialized = outlineTree.map(node => {
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

    try {
      const res = await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: serialized,
          wizardStatus: 'completed',
          wizardStep: 5,
        }),
      });
      if (!res.ok) throw new Error('更新失败');
      setStep(4);
    } catch (error) {
      console.error('Failed to apply outline', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto space-y-12">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            {novelId ? '完善你的故事' : '开启新篇章'}
          </h1>
          <p className="text-gray-400 mt-2">AI 辅助创作向导，从灵感到大纲只需几步</p>
        </div>
        {novelId && (
          <button
            className="btn-secondary px-4 py-2 text-sm"
            onClick={() => router.push(`/novels/${novelId}`)}
          >
            退出向导
          </button>
        )}
      </div>

      <div className="relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 -translate-y-1/2 rounded-full" />
        <div className="absolute top-1/2 left-0 h-0.5 bg-indigo-500 -translate-y-1/2 rounded-full transition-all duration-500"
          style={{ width: `${(step / (stepLabels.length - 1)) * 100}%` }}
        />
        <div className="relative flex justify-between">
          {stepLabels.map((label, index) => {
            const isActive = index === step;
            const isCompleted = index < step;
            return (
              <div key={label} className="flex flex-col items-center gap-2 cursor-pointer z-10" onClick={() => index < step && setStep(index)}>
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300
                  ${isActive ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_15px_rgba(99,102,241,0.5)]' :
                    isCompleted ? 'bg-indigo-900/50 border-indigo-500/50 text-indigo-200' :
                    'bg-[#0f1117] border-white/10 text-gray-600'}
                `}>
                  {isCompleted ? '✓' : index + 1}
                </div>
                <span className={`text-xs font-medium transition-colors duration-300 ${isActive ? 'text-white' : isCompleted ? 'text-indigo-200' : 'text-gray-600'}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {step === 0 && (
        <div className="glass-card p-8 rounded-3xl animate-fade-in space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                  基础信息
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">书名</label>
                    <input
                      className="glass-input w-full px-5 py-3 text-lg font-bold tracking-wide"
                      value={formData.title}
                      onChange={e => setField('title', e.target.value)}
                      placeholder="请输入书名"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">一句话简介</label>
                    <textarea
                      className="glass-input w-full px-4 py-3 min-h-[80px]"
                      value={formData.description}
                      onChange={e => setField('description', e.target.value)}
                      placeholder="吸引读者的核心梗概..."
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                  世界与风格
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">核心主题</label>
                    <input
                      className="glass-input w-full px-4 py-2"
                      value={formData.theme}
                      onChange={e => setField('theme', e.target.value)}
                      placeholder="例如：复仇、种田、无限流"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">所属频道</label>
                    <Select
                      value={formData.genre}
                      onChange={val => setField('genre', val)}
                      options={[
                        { value: '', label: '选择频道' },
                        ...GENRES.map(g => ({ value: g, label: g }))
                      ]}
                      placeholder="选择频道"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-300">世界观一句话</label>
                      <button
                        type="button"
                        onClick={handleGenerateWorldSetting}
                        disabled={worldBuildingLoading || isSaving}
                        className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2 py-1 rounded transition-colors flex items-center gap-1 border border-indigo-500/30"
                      >
                        {worldBuildingLoading ? (
                           <>
                             <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                             <span>生成中</span>
                           </>
                        ) : (
                           <>
                             <span>✨ AI 生成</span>
                           </>
                        )}
                      </button>
                    </div>
                    <input
                      className="glass-input w-full px-4 py-2"
                      value={formData.worldSetting}
                      onChange={e => setField('worldSetting', e.target.value)}
                      placeholder="例如：赛博朋克风格的修仙世界"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">关键词 (Tags)</label>
                    <input
                      className="glass-input w-full px-4 py-2"
                      value={formData.keywordsInput}
                      onChange={e => setField('keywordsInput', e.target.value)}
                      onBlur={() => setField('keywords', formData.keywordsInput.split(/[,，、]/).map(item => item.trim()).filter(Boolean))}
                      placeholder="热血, 系统, 穿越 (用逗号分隔)"
                    />
                    {keywordsDisplay && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {formData.keywords.map(k => (
                          <span key={k} className="px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30">
                            #{k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

               <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="w-1 h-6 bg-cyan-500 rounded-full"></span>
                  主角与要求
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-300">主角人设</label>
                      <button
                        type="button"
                        onClick={handleGenerateCharacter}
                        disabled={characterLoading || isSaving}
                        className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2 py-1 rounded transition-colors flex items-center gap-1 border border-indigo-500/30"
                      >
                        {characterLoading ? (
                           <>
                             <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                             <span>生成中</span>
                           </>
                        ) : (
                           <>
                             <span>✨ AI 生成</span>
                           </>
                        )}
                      </button>
                    </div>
                    <input
                      className="glass-input w-full px-4 py-2"
                      value={formData.protagonist}
                      onChange={e => setField('protagonist', e.target.value)}
                      placeholder="姓名，性格，金手指..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">特殊要求/禁忌</label>
                    <textarea
                      className="glass-input w-full px-4 py-2 min-h-[100px]"
                      value={formData.specialRequirements}
                      onChange={e => setField('specialRequirements', e.target.value)}
                      placeholder="给 AI 的额外叮嘱，比如不要写感情戏，或者必须是悲剧结尾..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              
              <div className="glass-panel p-5 rounded-xl space-y-5">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">篇幅设定</h4>
                
                <div className="flex bg-black/20 p-1 rounded-lg">
                  {['short', 'long'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setField('type', type)}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                        formData.type === type 
                          ? 'bg-indigo-600 text-white shadow-lg' 
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {type === 'short' ? '短篇' : '长篇'}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500">预计字数 (万)</label>
                    <input
                      type="number"
                      min={1}
                      className="glass-input w-full px-3 py-2 mt-1 text-right font-mono text-indigo-300"
                      value={formData.targetWords}
                      onChange={e => setField('targetWords', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">预估章节数</label>
                    <input
                      type="number"
                      min={1}
                      className="glass-input w-full px-3 py-2 mt-1 text-right font-mono text-indigo-300"
                      value={formData.chapterCount}
                      onChange={e => setField('chapterCount', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">大纲精细度</label>
                    <div className="mt-1">
                      <Select
                        value={formData.outlineMode}
                        onChange={val => setField('outlineMode', val)}
                        options={OUTLINE_MODES.map(m => ({ value: m.id, label: m.label }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">灵感预设</h4>
                <div className="grid grid-cols-1 gap-3">
                  {INSPIRATION_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      className="group relative overflow-hidden glass-panel p-4 rounded-xl text-left hover:border-indigo-500/50 transition-all duration-300 hover:-translate-y-1"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/10 group-hover:to-purple-500/10 transition-all duration-500"/>
                      <div className="relative z-10">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white font-medium group-hover:text-indigo-300 transition-colors">{preset.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-gray-400">
                            {preset.genre}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-2">{preset.theme}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-white/5">
            <button
              className="btn-primary px-8 py-3 text-lg shadow-indigo-500/20"
              disabled={isSaving}
              onClick={handleSaveBasicInfo}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  保存中...
                </span>
              ) : (
                '保存设定，下一步 →'
              )}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="glass-card p-8 rounded-3xl animate-fade-in space-y-8 min-h-[500px] flex flex-col">
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">核心设定生成</h2>
              <p className="text-gray-400 mt-1">自动生成简介、世界观与金手指</p>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary px-5 py-2" onClick={() => persistWizardStep(2)}>跳过</button>
              <button
                className="btn-ai px-6 py-2.5"
                onClick={startNovelSeed}
                disabled={!!jobStatus}
              >
                {jobStatus ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">✨</span>
                    <span>生成核心设定</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {jobStatus && (
            <div className="flex items-center justify-center p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-300 animate-pulse">
              {jobStatus}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">一句话简介</label>
              <textarea
                className="glass-input w-full p-4 min-h-[120px]"
                value={formData.description}
                onChange={e => setField('description', e.target.value)}
                placeholder="生成后会自动填充，也可手动编辑"
              />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-300">世界观核心</label>
                <button
                  onClick={() => startWorldBuilding()}
                  disabled={worldBuildingLoading || !novelId}
                  className="btn-ai text-xs px-3 py-1.5 min-w-[90px]"
                >
                  {worldBuildingLoading ? (
                    <span className="flex items-center gap-1">
                       <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                       生成中
                    </span>
                  ) : '✨ AI 生成'}
                </button>
              </div>
              <textarea
                className="glass-input w-full p-4 min-h-[120px]"
                value={formData.worldSetting}
                onChange={e => setField('worldSetting', e.target.value)}
                placeholder="生成后会自动填充，也可手动编辑"
              />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-300">主角设定</label>
                <button
                  onClick={() => startCharacterGeneration()}
                  disabled={characterLoading || !novelId}
                  className="btn-ai text-xs px-3 py-1.5 min-w-[90px]"
                >
                  {characterLoading ? (
                    <span className="flex items-center gap-1">
                       <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                       生成中
                    </span>
                  ) : '✨ AI 生成'}
                </button>
              </div>
              <textarea
                className="glass-input w-full p-4 min-h-[120px]"
                value={formData.protagonist}
                onChange={e => setField('protagonist', e.target.value)}
                placeholder="主角身份、性格、成长路径"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">金手指</label>
              <textarea
                className="glass-input w-full p-4 min-h-[120px]"
                value={formData.goldenFinger}
                onChange={e => setField('goldenFinger', e.target.value)}
                placeholder="外挂/系统/特殊能力"
              />
            </div>
          </div>

          {seedOutput && (
            <div className="text-xs text-gray-500">本次生成已同步保存到小说设定中。</div>
          )}

          <div className="flex justify-end pt-4">
            <button className="btn-primary px-8 py-3" onClick={() => persistWizardStep(2)}>确认并下一步 →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card p-8 rounded-3xl animate-fade-in space-y-8 min-h-[600px] flex flex-col">
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">粗略大纲</h2>
              <p className="text-gray-400 mt-1">生成故事主线与阶段节奏</p>
            </div>
            <div className="flex gap-3">
              <button
                className="btn-ai px-6 py-2.5"
                onClick={startRoughOutline}
                disabled={!!jobStatus}
              >
                {jobStatus ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    <span>生成中...</span>
                  </>
                ) : outlineTree.length > 0 ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <span>重新生成</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">✨</span>
                    <span>生成粗略大纲</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {jobStatus && (
            <div className="w-full h-1 bg-white/10 overflow-hidden rounded-full">
              <div className="h-full bg-indigo-500 animate-progress-indeterminate"></div>
            </div>
          )}

          <div className="flex-1 w-full glass-input p-6 min-h-[400px] custom-scrollbar overflow-y-auto">
            {outlineTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                <span className="text-4xl opacity-50">📝</span>
                <p>点击上方按钮，AI 将为您构建大纲结构...</p>
              </div>
            ) : (
              <div>
                {outlineTree.map(node => (
                   <OutlineTreeNode 
                     key={node.id} 
                     node={node} 
                     onToggle={toggleNode}
                     onGenerateNext={handleGenerateNext}
                     onUpdate={updateNodeContent}
                   />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-6 border-t border-white/5">
            <button
              className="btn-primary px-8 py-3"
              disabled={outlineTree.length === 0}
              onClick={() => persistWizardStep(3)}
            >
              确认并下一步 →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card p-8 rounded-3xl animate-fade-in space-y-8 min-h-[600px] flex flex-col">
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">大纲细化</h2>
              <p className="text-gray-400 mt-1">扩展细纲与章节，构建完整故事树</p>
            </div>
          </div>

          <div className="flex-1 w-full glass-input p-6 min-h-[400px] custom-scrollbar overflow-y-auto">
             <div>
                {outlineTree.map(node => (
                   <OutlineTreeNode 
                     key={node.id} 
                     node={node} 
                     onToggle={toggleNode}
                     onGenerateNext={handleGenerateNext}
                     onUpdate={updateNodeContent}
                   />
                ))}
              </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-white/5 gap-4">
            <button className="btn-secondary px-6 py-3" onClick={() => persistWizardStep(4, 'completed')}>稍后再说</button>
            <button
              className="btn-primary px-8 py-3 shadow-lg shadow-indigo-500/20"
              disabled={isSaving}
              onClick={applyOutline}
            >
              {isSaving ? '正在应用...' : '应用大纲并完成'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="glass-card p-12 rounded-3xl animate-scale-in text-center max-w-2xl mx-auto mt-20">
          <div className="w-24 h-24 bg-gradient-to-tr from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-green-500/20">
            <span className="text-4xl">🎉</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4">创建完成！</h2>
          <p className="text-xl text-gray-400 mb-8">你的小说架构已搭建完毕，现在开始创作正文吧。</p>

          {novelId && (
            <button
              className="btn-primary px-12 py-4 text-lg rounded-full shadow-2xl hover:scale-105 transition-transform"
              onClick={() => router.push(`/novels/${novelId}`)}
            >
              进入写作工作台
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NovelWizardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
      <NovelWizardContent />
    </Suspense>
  );
}


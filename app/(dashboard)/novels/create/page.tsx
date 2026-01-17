'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn, slideInRight, slideUp, staggerContainer, smoothTransition, scaleIn } from '@/app/lib/animations';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Card, CardContent } from '@/app/components/ui/Card';
import { Select } from '@/app/components/ui/Select';
import { Progress } from '@/app/components/ui/Progress';
import Modal, { ConfirmModal } from '@/app/components/ui/Modal';
import InspirationModal, { Inspiration } from './InspirationModal';

const GENRES = ['玄幻', '仙侠', '都市', '历史', '科幻', '游戏', '悬疑', '奇幻', '武侠', '言情', '其他'];
const OUTLINE_MODES = [
  { id: 'simple', label: '简版大纲' },
  { id: 'detailed', label: '详细大纲' },
];

// 每个频道的热门主题灵感预设 - 2024-2025年热门题材
const INSPIRATION_PRESETS: Record<string, Array<{
  name: string;
  theme: string;
  keywords: string[];
  protagonist: string;
  worldSetting: string;
}>> = {
  '玄幻': [
    {
      name: '诡秘复苏',
      theme: '诡异降临，规则怪谈',
      keywords: ['规则怪谈', '诡异', '都市异能', '序列'],
      protagonist: '获得诡异能力的普通人，在规则中求生',
      worldSetting: '诡异复苏的现代世界，规则即是生存法则',
    },
    {
      name: '万古神帝',
      theme: '天骄争霸，万界称尊',
      keywords: ['天骄', '神体', '万界', '称帝'],
      protagonist: '拥有无上神体的天骄，从低谷崛起',
      worldSetting: '万族林立、强者如云的修炼大世界',
    },
  ],
  '仙侠': [
    {
      name: '修仙模拟器',
      theme: '无限重生，完美人生',
      keywords: ['模拟器', '无限流', '重生', '完美'],
      protagonist: '获得人生模拟器的修士，可预演推衍',
      worldSetting: '正邪对立的传统修仙世界',
    },
    {
      name: '剑道第一仙',
      theme: '剑道独尊，一剑破万法',
      keywords: ['剑道', '一剑破万法', '逍遥', '天骄'],
      protagonist: '专注剑道的纯粹剑修，以剑证道',
      worldSetting: '百花齐放的修真界，剑道式微待复兴',
    },
  ],
  '都市': [
    {
      name: '从外卖员开始',
      theme: '草根逆袭，商业帝国',
      keywords: ['系统', '逆袭', '商战', '暴富'],
      protagonist: '获得金手指的普通打工人',
      worldSetting: '竞争激烈的现代都市商业战场',
    },
    {
      name: '我能看见战力值',
      theme: '都市异能，守护者',
      keywords: ['异能', '觉醒', '都市', '战力'],
      protagonist: '能看到他人属性面板的觉醒者',
      worldSetting: '异能觉醒的近未来都市',
    },
  ],
  '历史': [
    {
      name: '家父汉武帝',
      theme: '皇子争霸，王朝崛起',
      keywords: ['皇子', '争霸', '历史', '权谋'],
      protagonist: '穿越成皇子，运用现代知识',
      worldSetting: '风起云涌的大争之世',
    },
    {
      name: '科技改变历史',
      theme: '工业革命，文明跃升',
      keywords: ['科技', '种田', '发展', '争霸'],
      protagonist: '带着现代知识改变历史进程的穿越者',
      worldSetting: '等待开发的古代王朝',
    },
  ],
  '科幻': [
    {
      name: '机械飞升',
      theme: '赛博朋克，人机融合',
      keywords: ['赛博朋克', '改造', '义体', '飞升'],
      protagonist: '在义体改造中追寻人性的佣兵',
      worldSetting: '巨型企业统治的赛博朋克未来',
    },
    {
      name: '星门文明',
      theme: '星际探索，文明对决',
      keywords: ['星际', '文明', '虫族', '舰队'],
      protagonist: '指挥人类舰队对抗异族的统帅',
      worldSetting: '星门连接万千星域的宇宙时代',
    },
  ],
  '游戏': [
    {
      name: '全民领主',
      theme: '领地经营，争霸天下',
      keywords: ['领主', '建设', '争霸', '全民'],
      protagonist: '获得稀有初始的新晋领主',
      worldSetting: '全球穿越的领主争霸游戏世界',
    },
    {
      name: '无限副本',
      theme: '无限流，副本求生',
      keywords: ['无限流', '副本', '恐怖', '求生'],
      protagonist: '在诡异副本中挣扎求生的玩家',
      worldSetting: '被神秘游戏选中的现实世界',
    },
  ],
  '悬疑': [
    {
      name: '诡秘侦探',
      theme: '灵异探案，真相追寻',
      keywords: ['灵异', '探案', '悬疑', '诡秘'],
      protagonist: '能看到死亡线索的特殊侦探',
      worldSetting: '灵异事件频发的现代都市暗面',
    },
    {
      name: '规则怪谈',
      theme: '规则即生存，打破规则',
      keywords: ['规则', '怪谈', '恐怖', '生存'],
      protagonist: '在规则怪谈中寻找真相的普通人',
      worldSetting: '规则与怪谈交织的异常世界',
    },
  ],
  '奇幻': [
    {
      name: '魔法工业',
      theme: '魔法与科技的碰撞',
      keywords: ['魔法', '工业', '革命', '领主'],
      protagonist: '用科学思维解析魔法的穿越者',
      worldSetting: '魔法与蒸汽交织的奇幻大陆',
    },
    {
      name: '巫师之路',
      theme: '巫师晋升，真理探索',
      keywords: ['巫师', '晋升', '真理', '冷静'],
      protagonist: '理性冷静追求真理的巫师学徒',
      worldSetting: '巫师塔林立的黑暗中世纪',
    },
  ],
  '武侠': [
    {
      name: '江湖烟雨',
      theme: '快意恩仇，侠之大者',
      keywords: ['江湖', '门派', '武学', '侠义'],
      protagonist: '被卷入江湖恩怨的少年侠客',
      worldSetting: '门派林立、武学昌盛的江湖',
    },
    {
      name: '武道巅峰',
      theme: '武道探索，天下第一',
      keywords: ['武道', '突破', '宗师', '争锋'],
      protagonist: '追求武道极致的天才武者',
      worldSetting: '高手如云的武林盛世',
    },
  ],
  '言情': [
    {
      name: '重生复仇',
      theme: '重生虐渣，逆袭人生',
      keywords: ['重生', '复仇', '虐渣', '逆袭'],
      protagonist: '重生后看透一切的复仇女主',
      worldSetting: '豪门恩怨的现代都市',
    },
    {
      name: '穿书女配',
      theme: '穿书改命，反派大佬',
      keywords: ['穿书', '女配', '反派', '改命'],
      protagonist: '穿越成炮灰女配的现代人',
      worldSetting: '小说世界的剧情漩涡中心',
    },
  ],
  '其他': [
    {
      name: '自由创作',
      theme: '不拘一格',
      keywords: ['创新', '融合', '独特'],
      protagonist: '由你定义的独特主角',
      worldSetting: '由你构建的新世界',
    },
  ],
};

interface OutlineNode {
  id: string;
  title: string;
  content: string;
  level: 'rough' | 'detailed' | 'chapter';
  children: OutlineNode[];
  parentId?: string;
  isExpanded?: boolean;
  isGenerating?: boolean;
}

interface SeedOutputWorld {
  world_setting?: string;
  time_period?: string;
  location?: string;
  atmosphere?: string;
  rules?: string;
}

interface SeedOutput {
  synopsis?: string;
  protagonist?: string;
  golden_finger?: string;
  world?: SeedOutputWorld;
}

interface RoughOutlineOutput {
  blocks?: OutlineNode[];
}

interface DetailedOutlineOutput {
  children?: OutlineNode[];
}

const OutlineTreeNode = ({ 
  node, 
  onToggle, 
  onGenerateNext,
  onRegenerate,
  onUpdate
}: { 
  node: OutlineNode; 
  onToggle: (id: string) => void;
  onGenerateNext: (node: OutlineNode) => void;
  onRegenerate: (node: OutlineNode) => void;
  onUpdate: (id: string, content: string) => void;
}) => {
  const isLeaf = node.level === 'chapter';
  const padding = node.level === 'rough' ? 0 : node.level === 'detailed' ? 24 : 48;
  const nextLevelName = node.level === 'rough' ? '细纲' : '章节';

  return (
    <div className="mb-2 transition-all duration-300">
      <div 
        className={`glass-panel p-4 rounded-xl flex items-start gap-3 hover:bg-white/5 transition-colors ${node.level === 'rough' ? 'border-emerald-500/30' : ''}`}
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
              <span className="text-emerald-400 mr-2">{node.id}</span>
              {node.title}
            </h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              {node.children && node.children.length > 0 && <span className="text-green-400">✓</span>}
              {node.content && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegenerate(node); }}
                  disabled={node.isGenerating}
                  className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-1 rounded transition-colors border border-amber-500/30 disabled:opacity-50"
                >
                  {node.isGenerating ? '生成中...' : '重新生成'}
                </button>
              )}
              {!isLeaf && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateNext(node); }}
                  disabled={node.isGenerating}
                  className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-1 rounded transition-colors border border-emerald-500/30 disabled:opacity-50"
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
              onRegenerate={onRegenerate}
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

  const [step, setStep] = useState(0);
  const [novelId, setNovelId] = useState<string | null>(searchParams.get('novelId'));
  const [isSaving, setIsSaving] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [seedOutput, setSeedOutput] = useState<SeedOutput | null>(null);
  const [roughOutline, setRoughOutline] = useState<RoughOutlineOutput | null>(null);
  const [detailedOutline, setDetailedOutline] = useState<DetailedOutlineOutput | null>(null);
  const [chapterOutline, setChapterOutline] = useState<DetailedOutlineOutput | null>(null);
  const [generatedOutline, setGeneratedOutline] = useState('');
  const [worldBuildingLoading, setWorldBuildingLoading] = useState(false);
  const [characterLoading, setCharacterLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    title: presetTitle,
    description: presetDescription,
    type: 'long' as const,
    theme: '',
    genre: '',
    targetWords: 100,
    chapterCount: 300,
    protagonist: '',
    worldSetting: '',
    goldenFinger: '',
    keywords: [] as string[],
    keywordsInput: '',
    specialRequirements: '',
    outlineMode: 'simple',
  });

  const [outlineTree, setOutlineTree] = useState<OutlineNode[]>([]);
  const [isInspirationModalOpen, setIsInspirationModalOpen] = useState(false);
  const stepLabels = ['基础设定', '核心设定', '粗略大纲', '大纲细化', '完成'];

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    requireConfirmation?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'warning',
    onConfirm: () => {},
  });

  const showConfirmModal = (options: Omit<typeof confirmModalState, 'isOpen'>) => {
    setConfirmModalState({ ...options, isOpen: true });
  };

  const closeConfirmModal = () => {
    setConfirmModalState(prev => ({ ...prev, isOpen: false }));
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

  const setField = <K extends keyof typeof formData>(key: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: { name: string; theme: string; keywords: string[]; protagonist: string; worldSetting: string }) => {
    setFormData(prev => ({
      ...prev,
      theme: preset.theme,
      protagonist: preset.protagonist,
      worldSetting: preset.worldSetting,
      keywords: preset.keywords,
      keywordsInput: preset.keywords.join(', '),
    }));
  };

  const handleInspirationSelect = (inspiration: Inspiration) => {
    setFormData(prev => ({
      ...prev,
      title: prev.title || inspiration.name,
      theme: inspiration.theme,
      protagonist: inspiration.protagonist,
      worldSetting: inspiration.worldSetting,
      keywords: inspiration.keywords,
      keywordsInput: inspiration.keywords.join(', '),
    }));
    setIsInspirationModalOpen(false);
  };
  
  const currentGenrePresets = INSPIRATION_PRESETS[formData.genre] || INSPIRATION_PRESETS['其他'] || [];

  const persistWizardStep = async (nextStep: number, overrideStatus?: 'draft' | 'in_progress' | 'completed') => {
    if (!novelId) {
      setStep(nextStep);
      return;
    }
    try {
      const roughNodes = outlineTree.filter(n => n.level === 'rough');
      const detailedNodes = outlineTree.flatMap(n => n.children || []).filter(c => c.level === 'detailed');
      const chapterNodes = outlineTree.flatMap(n => (n.children || []).flatMap(c => c.children || [])).filter(c => c.level === 'chapter');

      let outlineStage = 'none';
      if (chapterNodes.length > 0) {
        outlineStage = 'chapters';
      } else if (detailedNodes.length > 0) {
        outlineStage = 'detailed';
      } else if (roughNodes.length > 0) {
        outlineStage = 'rough';
      }

      const payload: Record<string, unknown> = {
        wizardStatus: overrideStatus || (nextStep >= 4 ? 'completed' : 'in_progress'),
        wizardStep: nextStep,
      };

      if (outlineTree.length > 0) {
        payload.outlineRough = roughNodes.length > 0 ? { blocks: outlineTree } : null;
        payload.outlineDetailed = detailedNodes.length > 0 ? { blocks: detailedNodes } : null;
        payload.outlineChapters = chapterNodes.length > 0 ? { blocks: chapterNodes } : null;
        payload.outlineStage = outlineStage;
      }

      await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const pollJob = async (jobId: string, onSuccess: (output: unknown) => void) => {
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
      const roughNodes = outlineTree.filter(n => n.level === 'rough');
      const currentIndex = roughNodes.findIndex(n => n.id === node.id);
      
      const prevBlock = currentIndex > 0 ? roughNodes[currentIndex - 1] : null;
      const nextBlock = currentIndex < roughNodes.length - 1 ? roughNodes[currentIndex + 1] : null;
      
      const context = roughNodes
        .map(n => `${n.id}. ${n.title}: ${n.content}`)
        .join('\n');

      const output = await runJob('OUTLINE_DETAILED', {
        novelId,
        roughOutline: {},
        target_title: node.title,
        target_content: node.content,
        target_id: node.id,
        rough_outline_context: context,
        prev_block_title: prevBlock?.title || '',
        prev_block_content: prevBlock?.content || '',
        next_block_title: nextBlock?.title || '',
        next_block_content: nextBlock?.content || '',
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
      const context = outlineTree
        .flatMap(rough => rough.children || [])
        .map(detailed => `${detailed.id}. ${detailed.title}`)
        .join('\n');

      const output = await runJob('OUTLINE_CHAPTERS', {
        novelId,
        detailedOutline: {},
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

  const regenerateSingleNode = async (node: OutlineNode, parentNode: OutlineNode) => {
    if (!novelId) return;
    setNodeGenerating(node.id, true);

    try {
      const allDetailedNodes = outlineTree.flatMap(n => n.children || []);
      const currentIndex = allDetailedNodes.findIndex(n => n.id === node.id);
      
      const prevDetailedNode = currentIndex > 0 ? allDetailedNodes[currentIndex - 1] : null;
      const nextDetailedNode = currentIndex < allDetailedNodes.length - 1 ? allDetailedNodes[currentIndex + 1] : null;

      const output = await runJob('OUTLINE_DETAILED', {
        novelId,
        roughOutline: {},
        target_title: node.title,
        target_content: parentNode.content,
        target_id: node.id,
        rough_outline_context: `当前分卷：${parentNode.title}\n${parentNode.content}`,
        prev_block_title: prevDetailedNode?.title || '',
        prev_block_content: prevDetailedNode?.content || '',
        next_block_title: nextDetailedNode?.title || '',
        next_block_content: nextDetailedNode?.content || '',
        regenerate_single: true,
        original_node_title: node.title,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      
      if (json) {
        const newContent = json.content || json.children?.[0]?.content || '';
        const newTitle = json.title || json.children?.[0]?.title || node.title;
        
        const updateSingleNode = (nodes: OutlineNode[]): OutlineNode[] => {
          return nodes.map(n => {
            if (n.id === parentNode.id && n.children) {
              return {
                ...n,
                children: n.children.map(child => 
                  child.id === node.id 
                    ? { ...child, title: newTitle, content: newContent }
                    : child
                )
              };
            }
            if (n.children && n.children.length > 0) {
              return { ...n, children: updateSingleNode(n.children) };
            }
            return n;
          });
        };
        const updatedTree = updateSingleNode(outlineTree);
        setOutlineTree(updatedTree);
        await saveOutlineTree(updatedTree);
      }
    } catch (error) {
      console.error('Failed to regenerate single node', error);
      alert('重新生成失败，请重试');
    } finally {
      setNodeGenerating(node.id, false);
    }
  };

  const regenerateSingleChapter = async (node: OutlineNode, parentDetailedNode: OutlineNode) => {
    if (!novelId) return;
    setNodeGenerating(node.id, true);

    try {
      const siblingChapters = parentDetailedNode.children || [];
      const currentIndex = siblingChapters.findIndex(c => c.id === node.id);
      
      const prevChapter = currentIndex > 0 ? siblingChapters[currentIndex - 1] : null;
      const nextChapter = currentIndex < siblingChapters.length - 1 ? siblingChapters[currentIndex + 1] : null;

      const output = await runJob('OUTLINE_CHAPTERS', {
        novelId,
        detailedOutline: {},
        target_title: node.title,
        target_content: parentDetailedNode.content,
        target_id: node.id,
        detailed_outline_context: `当前细纲：${parentDetailedNode.title}\n${parentDetailedNode.content}`,
        prev_chapter_title: prevChapter?.title || '',
        prev_chapter_content: prevChapter?.content || '',
        next_chapter_title: nextChapter?.title || '',
        next_chapter_content: nextChapter?.content || '',
        regenerate_single: true,
        original_chapter_title: node.title,
      });

      const json = typeof output === 'string' ? safeParseJSON(output) : output;
      
      if (json) {
        const newContent = json.content || json.chapters?.[0]?.content || '';
        const newTitle = json.title || json.chapters?.[0]?.title || node.title;
        
        const updateSingleChapter = (nodes: OutlineNode[]): OutlineNode[] => {
          return nodes.map(roughNode => {
            if (!roughNode.children) return roughNode;
            
            return {
              ...roughNode,
              children: roughNode.children.map(detailedNode => {
                if (detailedNode.id === parentDetailedNode.id && detailedNode.children) {
                  return {
                    ...detailedNode,
                    children: detailedNode.children.map(chapterNode =>
                      chapterNode.id === node.id
                        ? { ...chapterNode, title: newTitle, content: newContent }
                        : chapterNode
                    )
                  };
                }
                return detailedNode;
              })
            };
          });
        };
        const updatedTree = updateSingleChapter(outlineTree);
        setOutlineTree(updatedTree);
        await saveOutlineTree(updatedTree);
      }
    } catch (error) {
      console.error('Failed to regenerate single chapter', error);
      alert('重新生成章节失败，请重试');
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

  const handleRegenerate = (node: OutlineNode) => {
    const hasChildren = outlineTree.some(n => 
      n.id === node.id && (n.children?.length ?? 0) > 0
    );
    
    if (node.level === 'rough') {
      const childCount = outlineTree.reduce((acc, n) => {
        const detailed = n.children?.length ?? 0;
        const chapters = n.children?.reduce((a, c) => a + (c.children?.length ?? 0), 0) ?? 0;
        return acc + detailed + chapters;
      }, 0);
      
      if (childCount > 0) {
        showConfirmModal({
          title: '⚠️ 高危操作确认',
          message: `重新生成粗纲将删除所有已生成的细纲和章节（共 ${childCount} 个节点）。此操作不可撤销！`,
          variant: 'danger',
          requireConfirmation: '确认删除',
          onConfirm: () => startRoughOutline(),
        });
        return;
      }
      
      showConfirmModal({
        title: '重新生成粗纲',
        message: '确定要重新生成粗略大纲吗？当前粗纲内容将被覆盖。',
        variant: 'warning',
        onConfirm: () => startRoughOutline(),
      });
    } else if (node.level === 'detailed') {
      const parentNode = outlineTree.find(n => n.children?.some(c => c.id === node.id));
      
      if (parentNode) {
        showConfirmModal({
          title: '重新生成此细纲',
          message: `确定要重新生成"${node.title}"吗？只会影响当前节点。`,
          variant: 'info',
          onConfirm: () => regenerateSingleNode(node, parentNode),
        });
      }
    } else if (node.level === 'chapter') {
      const grandParentNode = outlineTree.find(n => 
        n.children?.some(c => c.children?.some(gc => gc.id === node.id))
      );
      const parentDetailedNode = grandParentNode?.children?.find(c => c.children?.some(gc => gc.id === node.id));
      
      if (parentDetailedNode) {
        showConfirmModal({
          title: '重新生成此章节',
          message: `确定要重新生成"${node.title}"吗？只会影响当前章节。`,
          variant: 'info',
          onConfirm: () => regenerateSingleChapter(node, parentDetailedNode),
        });
      }
    }
  };


  const saveOutlineTree = async (treeToSave: OutlineNode[]) => {
    if (!novelId) return;
    
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

    const roughNodes = treeToSave.filter(n => n.level === 'rough');
    const detailedNodes = treeToSave.flatMap(n => n.children || []).filter(c => c.level === 'detailed');
    const chapterNodes = treeToSave.flatMap(n => (n.children || []).flatMap(c => c.children || [])).filter(c => c.level === 'chapter');

    let outlineStage = 'none';
    if (chapterNodes.length > 0) {
      outlineStage = 'chapters';
    } else if (detailedNodes.length > 0) {
      outlineStage = 'detailed';
    } else if (roughNodes.length > 0) {
      outlineStage = 'rough';
    }

    try {
      await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: serialized,
          outlineRough: roughNodes.length > 0 ? { blocks: roughNodes } : null,
          outlineDetailed: detailedNodes.length > 0 ? { blocks: detailedNodes } : null,
          outlineChapters: chapterNodes.length > 0 ? { blocks: chapterNodes } : null,
          outlineStage,
        }),
      });
    } catch (error) {
      console.error('Failed to auto-save outline', error);
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

    const roughNodes = outlineTree.filter(n => n.level === 'rough');
    const detailedNodes = outlineTree.flatMap(n => n.children || []).filter(c => c.level === 'detailed');
    const chapterNodes = outlineTree.flatMap(n => (n.children || []).flatMap(c => c.children || [])).filter(c => c.level === 'chapter');

    let outlineStage = 'none';
    if (chapterNodes.length > 0) {
      outlineStage = 'chapters';
    } else if (detailedNodes.length > 0) {
      outlineStage = 'detailed';
    } else if (roughNodes.length > 0) {
      outlineStage = 'rough';
    }

    try {
      const res = await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: serialized,
          outlineRough: roughNodes.length > 0 ? { blocks: roughNodes } : null,
          outlineDetailed: detailedNodes.length > 0 ? { blocks: detailedNodes } : null,
          outlineChapters: chapterNodes.length > 0 ? { blocks: chapterNodes } : null,
          outlineStage,
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
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        onClose={closeConfirmModal}
        onConfirm={confirmModalState.onConfirm}
        title={confirmModalState.title}
        message={confirmModalState.message}
        variant={confirmModalState.variant}
        requireConfirmation={confirmModalState.requireConfirmation}
      />

      <InspirationModal
        isOpen={isInspirationModalOpen}
        onClose={() => setIsInspirationModalOpen(false)}
        onSelect={handleInspirationSelect}
        genre={formData.genre}
        targetWords={formData.targetWords}
      />
      
      {/* Header */}
      <div className="flex items-end justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">
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
        <motion.div 
          className="absolute top-1/2 left-0 h-0.5 bg-emerald-500 -translate-y-1/2 rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${(step / (stepLabels.length - 1)) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
        <div className="relative flex justify-between">
          {stepLabels.map((label, index) => {
            const isActive = index === step;
            const isCompleted = index < step;
            return (
              <div key={label} className="flex flex-col items-center gap-2 cursor-pointer z-10" onClick={() => index < step && setStep(index)}>
                <motion.div 
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2
                    ${isActive ? 'bg-emerald-600 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]' :
                      isCompleted ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-200' :
                      'bg-[#0f1117] border-white/10 text-gray-600'}
                  `}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  animate={{ scale: isActive ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  {isCompleted ? '✓' : index + 1}
                </motion.div>
                <span className={`text-xs font-medium transition-colors duration-300 ${isActive ? 'text-white' : isCompleted ? 'text-emerald-200' : 'text-gray-600'}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step0"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full"
          >
            <Card className="p-8 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                      基础信息
                    </h3>
                    <div className="space-y-4">
                      <Input
                        label="书名"
                        showRequired
                        className="text-lg font-bold tracking-wide"
                        value={formData.title}
                        onChange={e => setField('title', e.target.value)}
                        placeholder="请输入书名"
                      />
                      <Textarea
                        label="一句话简介"
                        className="min-h-[80px]"
                        value={formData.description}
                        onChange={e => setField('description', e.target.value)}
                        placeholder="吸引读者的核心梗概..."
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                      世界与风格
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="核心主题"
                        showRequired
                        value={formData.theme}
                        onChange={e => setField('theme', e.target.value)}
                        placeholder="例如：复仇、种田、无限流"
                      />
                      <Select
                        label="所属频道"
                        showRequired
                        value={formData.genre}
                        onChange={val => setField('genre', val)}
                        options={GENRES.map(g => ({ value: g, label: g }))}
                        placeholder="选择频道"
                      />
                      <div className="md:col-span-2">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium text-gray-300">世界观一句话</label>
                          <Button
                            type="button"
                            variant="ai"
                            size="sm"
                            onClick={handleGenerateWorldSetting}
                            disabled={worldBuildingLoading || isSaving}
                            isLoading={worldBuildingLoading}
                          >
                            {worldBuildingLoading ? '生成中' : '✨ AI 生成'}
                          </Button>
                        </div>
                        <Input
                          value={formData.worldSetting}
                          onChange={e => setField('worldSetting', e.target.value)}
                          placeholder="例如：赛博朋克风格的修仙世界"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-300 mb-2">关键词 (Tags)</label>
                        <Input
                          value={formData.keywordsInput}
                          onChange={e => setField('keywordsInput', e.target.value)}
                          onBlur={() => setField('keywords', formData.keywordsInput.split(/[,，、]/).map(item => item.trim()).filter(Boolean))}
                          placeholder="热血, 系统, 穿越 (用逗号分隔)"
                        />
                        {keywordsDisplay && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {formData.keywords.map(k => (
                              <span key={k} className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30">
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
                          <Button
                            type="button"
                            variant="ai"
                            size="sm"
                            onClick={handleGenerateCharacter}
                            disabled={characterLoading || isSaving}
                            isLoading={characterLoading}
                          >
                            {characterLoading ? '生成中' : '✨ AI 生成'}
                          </Button>
                        </div>
                        <Input
                          value={formData.protagonist}
                          onChange={e => setField('protagonist', e.target.value)}
                          placeholder="姓名，性格，金手指..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">特殊要求/禁忌</label>
                        <Textarea
                          className="min-h-[100px]"
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

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500">预计字数 (万)</label>
                        <div className="grid grid-cols-4 gap-2 mt-2 mb-3">
                          {[50, 100, 150, 200, 250, 300, 400, 500].map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setField('targetWords', preset);
                                // Auto-adjust chapter count based on word count (avg 3000 words per chapter)
                                setField('chapterCount', Math.round(preset * 10000 / 3000));
                              }}
                              className={`px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                                formData.targetWords === preset
                                  ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200'
                              }`}
                            >
                              {preset}万
                            </button>
                          ))}
                        </div>
                        <Input
                          type="number"
                          min={10}
                          className="mt-1 text-right font-mono text-emerald-300"
                          value={formData.targetWords}
                          onChange={e => setField('targetWords', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">预估章节数</label>
                        <Input
                          type="number"
                          min={30}
                          className="mt-1 text-right font-mono text-emerald-300"
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
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                        灵感预设 {formData.genre && <span className="text-emerald-400 normal-case">· {formData.genre}</span>}
                      </h4>
                      {formData.genre && formData.targetWords > 0 && (
                        <Button
                          type="button"
                          variant="ai"
                          size="sm"
                          onClick={() => setIsInspirationModalOpen(true)}
                        >
                          ✨ AI 生成灵感
                        </Button>
                      )}
                    </div>
                    {!formData.genre ? (
                      <div className="glass-panel p-4 rounded-xl text-center text-gray-500 text-sm">
                        请先选择频道以查看热门题材预设
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {currentGenrePresets.map(preset => (
                          <button
                            key={preset.name}
                            onClick={() => applyPreset(preset)}
                            className="group relative overflow-hidden glass-panel p-4 rounded-xl text-left hover:border-emerald-500/50 transition-all duration-300 hover:-translate-y-1"
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 to-purple-500/0 group-hover:from-emerald-500/10 group-hover:to-purple-500/10 transition-all duration-500"/>
                            <div className="relative z-10">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-white font-medium group-hover:text-emerald-300 transition-colors">{preset.name}</span>
                              </div>
                              <div className="text-xs text-gray-500 line-clamp-2">{preset.theme}</div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {preset.keywords.slice(0, 3).map(kw => (
                                  <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-white/5">
                <Button
                  variant="primary"
                  className="px-8 py-3 text-lg shadow-emerald-500/20"
                  disabled={isSaving}
                  isLoading={isSaving}
                  onClick={handleSaveBasicInfo}
                >
                  {isSaving ? '保存中...' : '保存设定，下一步 →'}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

      {step === 1 && (
        <motion.div
          key="step1"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full"
        >
          <Card className="p-8 rounded-3xl space-y-8 min-h-[500px] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">核心设定生成</h2>
                <p className="text-gray-400 mt-1">自动生成简介、世界观与金手指</p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => persistWizardStep(2)}>跳过</Button>
                <Button
                  variant="ai"
                  onClick={startNovelSeed}
                  disabled={!!jobStatus}
                  isLoading={!!jobStatus}
                >
                  {jobStatus ? '生成中...' : (
                    <>
                      <span className="text-lg mr-2">✨</span>
                      <span>生成核心设定</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {jobStatus && (
              <div className="flex items-center justify-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-300 animate-pulse">
                {jobStatus}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Textarea
                  label="一句话简介"
                  className="min-h-[120px]"
                  value={formData.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="生成后会自动填充，也可手动编辑"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-300">世界观核心</label>
                  <Button
                    variant="ai"
                    size="sm"
                    onClick={() => startWorldBuilding()}
                    disabled={worldBuildingLoading || !novelId}
                    isLoading={worldBuildingLoading}
                  >
                    {worldBuildingLoading ? '生成中' : '✨ AI 生成'}
                  </Button>
                </div>
                <Textarea
                  className="min-h-[120px]"
                  value={formData.worldSetting}
                  onChange={e => setField('worldSetting', e.target.value)}
                  placeholder="生成后会自动填充，也可手动编辑"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-300">主角设定</label>
                  <Button
                    variant="ai"
                    size="sm"
                    onClick={() => startCharacterGeneration()}
                    disabled={characterLoading || !novelId}
                    isLoading={characterLoading}
                  >
                    {characterLoading ? '生成中' : '✨ AI 生成'}
                  </Button>
                </div>
                <Textarea
                  className="min-h-[120px]"
                  value={formData.protagonist}
                  onChange={e => setField('protagonist', e.target.value)}
                  placeholder="主角身份、性格、成长路径"
                />
              </div>
              <div className="space-y-3">
                <Textarea
                  label="金手指"
                  className="min-h-[120px]"
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
              <Button variant="primary" className="px-8 py-3" onClick={() => persistWizardStep(2)}>确认并下一步 →</Button>
            </div>
          </Card>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div
          key="step2"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full"
        >
          <Card className="p-8 rounded-3xl space-y-8 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">粗略大纲</h2>
                <p className="text-gray-400 mt-1">生成故事主线与阶段节奏</p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="ai"
                  onClick={startRoughOutline}
                  disabled={!!jobStatus}
                  isLoading={!!jobStatus && jobStatus !== '生成失败'}
                >
                  {jobStatus ? '生成中...' : outlineTree.length > 0 ? (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      <span>重新生成</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg mr-2">✨</span>
                      <span>生成粗略大纲</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {jobStatus && (
              <Progress value={undefined} className="h-1" indicatorClassName="animate-progress-indeterminate" />
            )}

            <div className="flex-1 w-full border border-white/10 bg-black/20 rounded-xl p-6 min-h-[400px] custom-scrollbar overflow-y-auto">
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
                        onRegenerate={handleRegenerate}
                        onUpdate={updateNodeContent}
                      />
                   ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-6 border-t border-white/5">
              <Button
                variant="primary"
                className="px-8 py-3"
                disabled={outlineTree.length === 0}
                onClick={() => persistWizardStep(3)}
              >
                确认并下一步 →
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div
          key="step3"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full"
        >
          <Card className="p-8 rounded-3xl space-y-8 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">大纲细化</h2>
                <p className="text-gray-400 mt-1">扩展细纲与章节，构建完整故事树</p>
              </div>
            </div>

            <div className="flex-1 w-full border border-white/10 bg-black/20 rounded-xl p-6 min-h-[400px] custom-scrollbar overflow-y-auto">
               <div>
                {outlineTree.map(node => (
                      <OutlineTreeNode 
                        key={node.id} 
                        node={node} 
                        onToggle={toggleNode}
                        onGenerateNext={handleGenerateNext}
                        onRegenerate={handleRegenerate}
                        onUpdate={updateNodeContent}
                      />
                   ))}
                </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-white/5 gap-4">
              <Button variant="secondary" onClick={() => persistWizardStep(4, 'completed')}>稍后再说</Button>
              <Button
                variant="primary"
                className="px-8 py-3 shadow-lg shadow-emerald-500/20"
                disabled={isSaving}
                isLoading={isSaving}
                onClick={applyOutline}
              >
                {isSaving ? '正在应用...' : '应用大纲并完成'}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {step === 4 && (
        <motion.div
          key="step4"
          variants={scaleIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full"
        >
          <Card className="p-12 rounded-3xl text-center max-w-2xl mx-auto mt-20">
            <div className="w-24 h-24 bg-gradient-to-tr from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-green-500/20">
              <span className="text-4xl">🎉</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">创建完成！</h2>
            <p className="text-xl text-gray-400 mb-8">你的小说架构已搭建完毕，现在开始创作正文吧。</p>

            {novelId && (
              <Button
                variant="primary"
                className="px-12 py-4 text-lg rounded-full shadow-2xl hover:scale-105 transition-transform"
                onClick={() => router.push(`/novels/${novelId}`)}
              >
                进入写作工作台
              </Button>
            )}
          </Card>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

export default function NovelWizardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
      <NovelWizardContent />
    </Suspense>
  );
}


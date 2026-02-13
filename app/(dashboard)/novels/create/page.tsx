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

// Outline types removed

// OutlineTreeNode component removed

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
// Unused outline states removed
  const [worldBuildingLoading, setWorldBuildingLoading] = useState(false);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [synopsisLoading, setSynopsisLoading] = useState(false);
  const [goldenFingerLoading, setGoldenFingerLoading] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
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

// Outline state removed
  const [isInspirationModalOpen, setIsInspirationModalOpen] = useState(false);
  const stepLabels = ['基础设定', '完成'];

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

// Helper functions removed

  useEffect(() => () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
  }, []);

  const keywordsDisplay = useMemo(() => formData.keywords.join('、'), [formData.keywords]);

  const setField = <K extends keyof typeof formData>(key: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const getKeywordsArray = () => {
    return formData.keywords.length > 0
      ? formData.keywords
      : formData.keywordsInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  };

  const patchNovelFields = async (id: string, payload: Record<string, unknown>) => {
    await fetch(`/api/novels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  const ensureNovelId = async (): Promise<string | null> => {
    if (novelId) return novelId;
    return saveNovel(false);
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
      const payload: Record<string, unknown> = {
        wizardStatus: overrideStatus || (nextStep >= 3 ? 'completed' : 'in_progress'),
        wizardStep: nextStep,
      };

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
      goldenFinger: formData.goldenFinger || undefined,
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
        // 简化流程：直接跳转到完成页 (step 1)
        await persistWizardStep(1, 'completed');
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
      const keywordsArray = getKeywordsArray();
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
        await patchNovelFields(idToUse, { worldSetting: output.world_setting });
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
      const keywordsArray = getKeywordsArray();
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
        await patchNovelFields(idToUse, { protagonist: desc });
      }
    } catch (error) {
      console.error('Failed to generate character', error);
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setCharacterLoading(false);
    }
  };

  const startSynopsisGeneration = async (overrideId?: string) => {
    const idToUse = overrideId || novelId;
    if (!idToUse) return;
    setSynopsisLoading(true);
    try {
      const keywordsArray = getKeywordsArray();
      const output = await runJob('WIZARD_SYNOPSIS', {
        novelId: idToUse,
        title: formData.title,
        theme: formData.theme,
        genre: formData.genre,
        keywords: keywordsArray.join(', '),
        protagonist: formData.protagonist,
        worldSetting: formData.worldSetting,
        goldenFinger: formData.goldenFinger,
        existingSynopsis: formData.description,
        specialRequirements: formData.specialRequirements,
      });
      if (output && output.synopsis) {
        setField('description', output.synopsis);
        await patchNovelFields(idToUse, { description: output.synopsis });
      }
    } catch (error) {
      console.error('Failed to generate synopsis', error);
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setSynopsisLoading(false);
    }
  };

  const startGoldenFingerGeneration = async (overrideId?: string) => {
    const idToUse = overrideId || novelId;
    if (!idToUse) return;
    setGoldenFingerLoading(true);
    try {
      const keywordsArray = getKeywordsArray();
      const output = await runJob('WIZARD_GOLDEN_FINGER', {
        novelId: idToUse,
        title: formData.title,
        theme: formData.theme,
        genre: formData.genre,
        keywords: keywordsArray.join(', '),
        protagonist: formData.protagonist,
        worldSetting: formData.worldSetting,
        targetWords: formData.targetWords,
        existingGoldenFinger: formData.goldenFinger,
        specialRequirements: formData.specialRequirements,
      });
      if (output && output.golden_finger) {
        setField('goldenFinger', output.golden_finger);
        await patchNovelFields(idToUse, { goldenFinger: output.golden_finger });
      }
    } catch (error) {
      console.error('Failed to generate golden finger', error);
      alert(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGoldenFingerLoading(false);
    }
  };

  const handleGenerateWorldSetting = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }
    const id = await ensureNovelId();
    if (id) {
      await startWorldBuilding(id);
    }
  };

  const handleGenerateCharacter = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }
    const id = await ensureNovelId();
    if (id) {
      await startCharacterGeneration(id);
    }
  };

  const handleGenerateSynopsis = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }
    const id = await ensureNovelId();
    if (id) {
      await startSynopsisGeneration(id);
    }
  };

  const handleGenerateGoldenFinger = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }
    const id = await ensureNovelId();
    if (id) {
      await startGoldenFingerGeneration(id);
    }
  };

  const startNovelSeed = async (overrideId?: string) => {
    const idToUse = overrideId || novelId;
    if (!idToUse) return;
    setJobStatus('生成核心设定中...');

    try {
      const output = await runJob('NOVEL_SEED', {
        novelId: idToUse,
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

      await patchNovelFields(idToUse, {
        description: output?.synopsis || undefined,
        protagonist: output?.protagonist || undefined,
        goldenFinger: output?.golden_finger || undefined,
        worldSetting: world.world_setting || undefined,
      });
      setJobStatus('');
      return output;
    } catch (error) {
      console.error('Failed to generate seed data', error);
      setJobStatus(error instanceof Error ? error.message : '生成失败');
      throw error;
    }
  };

  const handleAutoGenerateCoreSetup = async () => {
    if (!formData.title.trim()) {
      alert('请先填写书名');
      return;
    }

    let success = false;
    setAutoGenerating(true);
    try {
      const id = await ensureNovelId();
      if (!id) {
        throw new Error('创建小说失败，请重试');
      }

      await startNovelSeed(id);

      setJobStatus('生成主角设定中...');
      await startCharacterGeneration(id);

      setJobStatus('核心设定生成完成');
      success = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '一键生成失败';
      setJobStatus(msg);
      alert(msg);
    } finally {
      setAutoGenerating(false);
      if (success) {
        setTimeout(() => setJobStatus(''), 1500);
      }
    }
  };

// Outline generation logic removed as it's now handled in the workbench

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
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                        基础信息
                      </h3>
                      <Button
                        variant="ai"
                        size="sm"
                        onClick={handleAutoGenerateCoreSetup}
                        disabled={autoGenerating || isSaving || !formData.title.trim()}
                        isLoading={autoGenerating}
                      >
                        {autoGenerating ? '生成中' : '✨ 一键生成核心设定'}
                      </Button>
                    </div>
                    <div className="space-y-4">
                      <Input
                        label="书名"
                        showRequired
                        className="text-lg font-bold tracking-wide"
                        value={formData.title}
                        onChange={e => setField('title', e.target.value)}
                        placeholder="请输入书名"
                      />
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-medium text-gray-300">一句话简介</label>
                          <Button
                            variant="ai"
                            size="sm"
                            onClick={handleGenerateSynopsis}
                            disabled={synopsisLoading || !formData.title.trim()}
                            isLoading={synopsisLoading}
                          >
                            {synopsisLoading ? '生成中' : '✨ AI 生成'}
                          </Button>
                        </div>
                        <Textarea
                          className="min-h-[80px]"
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
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-gray-300">世界观</label>
                        <Button
                          variant="ai"
                          size="sm"
                          onClick={handleGenerateWorldSetting}
                          disabled={worldBuildingLoading || !formData.title.trim()}
                          isLoading={worldBuildingLoading}
                        >
                          {worldBuildingLoading ? '生成中' : '✨ AI 生成'}
                        </Button>
                      </div>
                      <Textarea
                        className="min-h-[100px]"
                        value={formData.worldSetting}
                        onChange={e => setField('worldSetting', e.target.value)}
                        placeholder="例如：赛博朋克风格的修仙世界，灵气与科技共存..."
                      />
                    </div>
                    <div>
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

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span className="w-1 h-6 bg-cyan-500 rounded-full"></span>
                      主角与金手指
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-medium text-gray-300">主角人设</label>
                          <Button
                            variant="ai"
                            size="sm"
                            onClick={handleGenerateCharacter}
                            disabled={characterLoading || !formData.title.trim()}
                            isLoading={characterLoading}
                          >
                            {characterLoading ? '生成中' : '✨ AI 生成'}
                          </Button>
                        </div>
                        <Textarea
                          className="min-h-[100px]"
                          value={formData.protagonist}
                          onChange={e => setField('protagonist', e.target.value)}
                          placeholder="主角姓名、性格、成长路径..."
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-medium text-gray-300">金手指</label>
                          <Button
                            variant="ai"
                            size="sm"
                            onClick={handleGenerateGoldenFinger}
                            disabled={goldenFingerLoading || !formData.title.trim()}
                            isLoading={goldenFingerLoading}
                          >
                            {goldenFingerLoading ? '生成中' : '✨ AI 生成'}
                          </Button>
                        </div>
                        <Textarea
                          className="min-h-[80px]"
                          value={formData.goldenFinger}
                          onChange={e => setField('goldenFinger', e.target.value)}
                          placeholder="外挂/系统/特殊能力..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">特殊要求/禁忌</label>
                        <Textarea
                          className="min-h-[80px]"
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
                  {isSaving ? '创建中...' : '创建小说'}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

      {step === 1 && (
        <motion.div
          key="step1"
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
            <p className="text-xl text-gray-400 mb-8">你的小说已创建成功，现在可以生成大纲并开始创作正文。</p>

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

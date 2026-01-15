'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

  const stepLabels = ['基础设定', '核心设定', '粗略大纲', '细纲扩展', '章节大纲', '完成'];

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
          wizardStatus: overrideStatus || (nextStep >= 5 ? 'completed' : 'in_progress'),
          wizardStep: nextStep,
        }),
      });
    } catch (error) {
      console.error('Failed to persist wizard step', error);
    } finally {
      setStep(nextStep);
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!formData.title.trim()) return;
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

    try {
      if (novelId) {
        const res = await fetch(`/api/novels/${novelId}`, {
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
        setNovelId(data.novel?.id || null);
      }
      await persistWizardStep(1, 'in_progress');
    } catch (error) {
      console.error('Failed to save novel', error);
    } finally {
      setIsSaving(false);
      setJobStatus('');
    }
  };

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
      if (attempts < 60) {
        pollTimerRef.current = setTimeout(poll, 2000);
      } else {
        reject(new Error('生成超时'));
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
      throw new Error('生成失败');
    }
    const { job } = await res.json();
    return pollJobResult(job.id);
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
      const outlineText = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      setRoughOutline(outlineText);
      setJobStatus('');
    } catch (error) {
      console.error('Failed to generate rough outline', error);
      setJobStatus(error instanceof Error ? error.message : '生成失败');
    }
  };

  const startDetailedOutline = async () => {
    if (!novelId || !roughOutline) return;
    setJobStatus('生成细纲中...');

    try {
      const output = await runJob('OUTLINE_DETAILED', {
        novelId,
        roughOutline,
        targetWords: formData.targetWords,
        chapterCount: formData.chapterCount,
      });
      const outlineText = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      setDetailedOutline(outlineText);
      setJobStatus('');
    } catch (error) {
      console.error('Failed to generate detailed outline', error);
      setJobStatus(error instanceof Error ? error.message : '生成失败');
    }
  };

  const startChapterOutline = async () => {
    if (!novelId || !detailedOutline) return;
    setJobStatus('生成章节大纲中...');

    try {
      const output = await runJob('OUTLINE_CHAPTERS', {
        novelId,
        detailedOutline,
      });
      const outlineText = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      setChapterOutline(outlineText);
      setGeneratedOutline(outlineText || '');
      setJobStatus('');
    } catch (error) {
      console.error('Failed to generate chapter outline', error);
      setJobStatus(error instanceof Error ? error.message : '生成失败');
    }
  };

  const applyOutline = async () => {
    if (!novelId || !generatedOutline) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/novels/${novelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: generatedOutline,
          wizardStatus: 'completed',
          wizardStep: 5,
        }),
      });
      if (!res.ok) throw new Error('更新失败');
      setStep(5);
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
                      placeholder="《       》"
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
                    <select
                      className="glass-input w-full px-4 py-2 appearance-none"
                      value={formData.genre}
                      onChange={e => setField('genre', e.target.value)}
                    >
                      <option value="">选择频道</option>
                      {GENRES.map(genre => (
                        <option key={genre} value={genre} className="bg-gray-900 text-gray-200">
                          {genre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">世界观一句话</label>
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
                    <label className="block text-sm font-medium text-gray-300 mb-2">主角人设</label>
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
                    <select
                      className="glass-input w-full px-3 py-2 mt-1 text-sm"
                      value={formData.outlineMode}
                      onChange={e => setField('outlineMode', e.target.value)}
                    >
                      {OUTLINE_MODES.map(mode => (
                        <option key={mode.id} value={mode.id} className="bg-gray-900">
                          {mode.label}
                        </option>
                      ))}
                    </select>
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
                className="btn-primary px-5 py-2 flex items-center gap-2"
                onClick={startNovelSeed}
                disabled={!!jobStatus}
              >
                {jobStatus ? '生成中...' : '✨ 生成核心设定'}
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
              <label className="text-sm font-medium text-gray-300">世界观核心</label>
              <textarea
                className="glass-input w-full p-4 min-h-[120px]"
                value={formData.worldSetting}
                onChange={e => setField('worldSetting', e.target.value)}
                placeholder="生成后会自动填充，也可手动编辑"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">主角设定</label>
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
                className="btn-primary px-5 py-2 flex items-center gap-2"
                onClick={startRoughOutline}
                disabled={!!jobStatus}
              >
                {jobStatus ? '生成中...' : roughOutline ? '重新生成' : '✨ 生成粗略大纲'}
              </button>
            </div>
          </div>

          {jobStatus && (
            <div className="w-full h-1 bg-white/10 overflow-hidden rounded-full">
              <div className="h-full bg-indigo-500 animate-progress-indeterminate"></div>
            </div>
          )}

          <textarea
            className="flex-1 w-full glass-input p-6 text-base leading-relaxed font-mono resize-none custom-scrollbar"
            value={roughOutline || ''}
            onChange={e => setRoughOutline(e.target.value)}
            placeholder="点击生成，AI 将输出粗略大纲..."
          />

          <div className="flex justify-end pt-6 border-t border-white/5">
            <button
              className="btn-primary px-8 py-3"
              disabled={!roughOutline}
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
              <h2 className="text-2xl font-bold text-white">细纲扩展</h2>
              <p className="text-gray-400 mt-1">细化事件与节奏，支持重新生成</p>
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary px-5 py-2 flex items-center gap-2"
                onClick={startDetailedOutline}
                disabled={!!jobStatus || !roughOutline}
              >
                {jobStatus ? '生成中...' : detailedOutline ? '重新生成' : '✨ 生成细纲'}
              </button>
            </div>
          </div>

          {jobStatus && (
            <div className="w-full h-1 bg-white/10 overflow-hidden rounded-full">
              <div className="h-full bg-indigo-500 animate-progress-indeterminate"></div>
            </div>
          )}

          <textarea
            className="flex-1 w-full glass-input p-6 text-base leading-relaxed font-mono resize-none custom-scrollbar"
            value={detailedOutline || ''}
            onChange={e => setDetailedOutline(e.target.value)}
            placeholder="生成后展示细纲，可自行微调..."
          />

          <div className="flex justify-end pt-6 border-t border-white/5">
            <button
              className="btn-primary px-8 py-3"
              disabled={!detailedOutline}
              onClick={() => persistWizardStep(4)}
            >
              确认并下一步 →
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="glass-card p-8 rounded-3xl animate-fade-in space-y-8 min-h-[600px] flex flex-col">
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">章节大纲</h2>
              <p className="text-gray-400 mt-1">生成每章剧情要点，支持微调</p>
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary px-5 py-2 flex items-center gap-2"
                onClick={startChapterOutline}
                disabled={!!jobStatus || !detailedOutline}
              >
                {jobStatus ? '生成中...' : generatedOutline ? '重新生成' : '✨ 生成章节大纲'}
              </button>
            </div>
          </div>

          {jobStatus && (
            <div className="w-full h-1 bg-white/10 overflow-hidden rounded-full">
              <div className="h-full bg-indigo-500 animate-progress-indeterminate"></div>
            </div>
          )}

          <textarea
            className="flex-1 w-full glass-input p-6 text-base leading-relaxed font-mono resize-none custom-scrollbar"
            value={generatedOutline}
            onChange={e => setGeneratedOutline(e.target.value)}
            placeholder="章节大纲将显示在此..."
          />

          <div className="flex justify-end pt-6 border-t border-white/5 gap-4">
            <button className="btn-secondary px-6 py-3" onClick={() => persistWizardStep(5, 'completed')}>稍后再说</button>
            <button
              className="btn-primary px-8 py-3 shadow-lg shadow-indigo-500/20"
              disabled={isSaving || !generatedOutline}
              onClick={applyOutline}
            >
              {isSaving ? '正在应用...' : '应用大纲并完成'}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
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


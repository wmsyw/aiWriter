'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import Modal from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { useJobPolling } from '@/app/lib/hooks/useJobPolling';

export interface Inspiration {
  name: string;
  theme: string;
  keywords: string[];
  protagonist: string;
  worldSetting: string;
  hook?: string;
  potential?: string;
}

interface InspirationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (inspiration: Inspiration) => void;
  genre: string;
  targetWords: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

const PROGRESS_MESSAGES = [
  '正在分析题材趋势...',
  '正在研究热门元素...',
  '正在构思主角设定...',
  '正在编织世界观...',
  '正在提炼核心卖点...',
  '正在优化创意组合...',
  '即将完成...',
];

const AUDIENCE_OPTIONS = [
  { value: '全年龄', label: '全年龄' },
  { value: '男性读者', label: '男性读者' },
  { value: '女性读者', label: '女性读者' },
  { value: '青少年', label: '青少年' },
  { value: '成年读者', label: '成年读者' },
];

const STYLE_OPTIONS = [
  { value: '', label: '不限风格' },
  { value: '轻松幽默', label: '轻松幽默' },
  { value: '热血燃向', label: '热血燃向' },
  { value: '暗黑压抑', label: '暗黑压抑' },
  { value: '温馨治愈', label: '温馨治愈' },
  { value: '悬疑烧脑', label: '悬疑烧脑' },
  { value: '史诗宏大', label: '史诗宏大' },
  { value: '诙谐讽刺', label: '诙谐讽刺' },
  { value: '细腻文艺', label: '细腻文艺' },
  { value: '硬核写实', label: '硬核写实' },
  { value: '荒诞离奇', label: '荒诞离奇' },
  { value: '浪漫唯美', label: '浪漫唯美' },
  { value: '冷峻凌厉', label: '冷峻凌厉' },
];

const TONE_OPTIONS = [
  { value: '', label: '不限基调' },
  { value: '爽文节奏', label: '爽文节奏' },
  { value: '慢热养成', label: '慢热养成' },
  { value: '虐心虐身', label: '虐心虐身' },
  { value: '甜宠日常', label: '甜宠日常' },
  { value: '权谋争斗', label: '权谋争斗' },
  { value: '热血励志', label: '热血励志' },
  { value: '沉郁悲壮', label: '沉郁悲壮' },
  { value: '轻快欢脱', label: '轻快欢脱' },
  { value: '紧张刺激', label: '紧张刺激' },
  { value: '压抑窒息', label: '压抑窒息' },
  { value: '豁达释然', label: '豁达释然' },
  { value: '苦尽甘来', label: '苦尽甘来' },
  { value: '黑色幽默', label: '黑色幽默' },
];

const PERSPECTIVE_OPTIONS = [
  { value: '', label: '不限视角' },
  { value: '第一人称', label: '第一人称' },
  { value: '第三人称限制', label: '第三人称限制' },
  { value: '第三人称全知', label: '第三人称全知' },
  { value: '多视角切换', label: '多视角切换' },
  { value: '群像文', label: '群像文' },
];

const CACHE_MAX_SIZE = 50;
const inspirationCache = new Map<string, Inspiration[]>();

function setCacheWithLimit(key: string, value: Inspiration[]): void {
  if (inspirationCache.size >= CACHE_MAX_SIZE) {
    const firstKey = inspirationCache.keys().next().value;
    if (firstKey) inspirationCache.delete(firstKey);
  }
  inspirationCache.set(key, value);
}

function getCacheKey(genre: string, targetWords: number, audience: string, keywords: string, style: string, tone: string, perspective: string): string {
  return `${genre}:${targetWords}:${audience}:${keywords}:${style}:${tone}:${perspective}`;
}

export default function InspirationModal({
  isOpen,
  onClose,
  onSelect,
  genre,
  targetWords
}: InspirationModalProps) {
  const [step, setStep] = useState<'settings' | 'generating' | 'results'>('settings');
  const [count, setCount] = useState(5);
  const [audience, setAudience] = useState('全年龄');
  const [style, setStyle] = useState('');
  const [tone, setTone] = useState('');
  const [perspective, setPerspective] = useState('');
  const [keywords, setKeywords] = useState('');
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIndexRef = useRef(0);

  const { data, status, error, startPolling, stopPolling } = useJobPolling<Inspiration[]>();

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startProgressMessages = useCallback(() => {
    progressIndexRef.current = 0;
    setProgressMessage(PROGRESS_MESSAGES[0]);
    
    progressIntervalRef.current = setInterval(() => {
      progressIndexRef.current = Math.min(
        progressIndexRef.current + 1,
        PROGRESS_MESSAGES.length - 1
      );
      setProgressMessage(PROGRESS_MESSAGES[progressIndexRef.current]);
    }, 3000);
  }, []);

  useEffect(() => {
    if (status === 'completed' && data) {
      clearProgressInterval();
      const result = Array.isArray(data) ? data : [];
      setInspirations(result);
      
      const cacheKey = getCacheKey(genre, targetWords, audience, keywords, style, tone, perspective);
      setCacheWithLimit(cacheKey, result);
      
      setStep('results');
    } else if (status === 'failed' && error) {
      clearProgressInterval();
      setErrorMessage(error);
      setTimeout(() => {
        setStep('settings');
        setErrorMessage('');
      }, 3000);
    }
  }, [status, data, error, clearProgressInterval, genre, targetWords, audience, keywords, style, tone, perspective]);

  useEffect(() => {
    if (isOpen) {
      const cacheKey = getCacheKey(genre, targetWords, audience, keywords, style, tone, perspective);
      const cached = inspirationCache.get(cacheKey);

      if (cached && cached.length > 0) {
        setInspirations(cached);
        setStep('results');
      } else {
        setStep('settings');
        setInspirations([]);
      }
      setExpandedIndex(null);
      setErrorMessage('');
      setProgressMessage('');
    } else {
      stopPolling();
      clearProgressInterval();
    }
    
    return () => {
      stopPolling();
      clearProgressInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleGenerate = async () => {
    setStep('generating');
    setErrorMessage('');
    setExpandedIndex(null);
    startProgressMessages();

    const extraRequirements = [
      style && `写作风格：${style}`,
      tone && `情感基调：${tone}`,
      perspective && `叙事视角：${perspective}`,
    ].filter(Boolean).join('；');

    const fullKeywords = [keywords, extraRequirements].filter(Boolean).join('。');

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'WIZARD_INSPIRATION',
          input: {
            genre,
            targetWords,
            targetAudience: audience,
            keywords: fullKeywords,
            count
          }
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.error === 'Too many requests' 
          ? '请求过于频繁，请稍后再试'
          : (errorData.error || '生成请求失败');
        throw new Error(msg);
      }
      
      const { job } = await res.json();
      startPolling(job.id);
    } catch (err) {
      clearProgressInterval();
      setErrorMessage(err instanceof Error ? err.message : '生成失败');
      setTimeout(() => {
        setStep('settings');
        setErrorMessage('');
      }, 3000);
    }
  };

  const handleRetry = () => {
    const cacheKey = getCacheKey(genre, targetWords, audience, keywords, style, tone, perspective);
    inspirationCache.delete(cacheKey);
    setStep('settings');
    setInspirations([]);
    setExpandedIndex(null);
  };

  const handleCardClick = (idx: number) => {
    if (expandedIndex === idx) {
      onSelect(inspirations[idx]);
    } else {
      setExpandedIndex(idx);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="灵感生成器"
      size="2xl"
      className="bg-zinc-950/90 border border-white/10"
    >
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {step === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-5"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">生成数量</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(e) => setCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 5)))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">目标读者</label>
                  <Select
                    value={audience}
                    onChange={setAudience}
                    options={AUDIENCE_OPTIONS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">写作风格</label>
                  <Select
                    value={style}
                    onChange={setStyle}
                    options={STYLE_OPTIONS}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">情感基调</label>
                  <Select
                    value={tone}
                    onChange={setTone}
                    options={TONE_OPTIONS}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">叙事视角</label>
                  <Select
                    value={perspective}
                    onChange={setPerspective}
                    options={PERSPECTIVE_OPTIONS}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">关键词提示 (可选)</label>
                <Textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="例如：赛博朋克、复仇、克苏鲁... (留空则由 AI 自由发挥)"
                  className="min-h-[100px] bg-black/20"
                />
              </div>

              <div className="pt-3">
                <Button
                  onClick={handleGenerate}
                  leftIcon="✨"
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-300 hover:scale-[1.02]"
                >
                  开始探索灵感
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-[400px] space-y-8"
            >
              <div className="relative w-24 h-24">
                <motion.div
                  className="absolute inset-0 border-4 border-emerald-500/30 rounded-full"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">✨</span>
                </div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">正在编织灵感...</h3>
                <p className="text-zinc-400 animate-pulse min-h-[1.5em]">
                  {errorMessage || progressMessage || 'AI 正在头脑风暴'}
                </p>
                {errorMessage && (
                  <p className="text-red-400 text-sm mt-2">{errorMessage}</p>
                )}
              </div>
            </motion.div>
          )}

          {step === 'results' && (
            <motion.div
              key="results"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white">为你找到 {inspirations.length} 个灵感</h3>
                  <p className="text-xs text-zinc-500 mt-1">点击卡片查看详情，再次点击应用灵感</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRetry}
                  className="text-zinc-400 hover:text-white"
                >
                  重新生成
                </Button>
              </div>

              <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                {inspirations.map((item, idx) => {
                  const isExpanded = expandedIndex === idx;
                  return (
                    <motion.div
                      key={idx}
                      variants={itemVariants}
                      onClick={() => handleCardClick(idx)}
                      className={`group relative p-4 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                        isExpanded 
                          ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                          : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'
                      }`}
                    >
                      <div className="relative space-y-3">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className={`font-bold text-lg transition-colors truncate ${
                                isExpanded ? 'text-emerald-300' : 'text-emerald-400 group-hover:text-emerald-300'
                              }`}>
                                {item.name}
                              </h4>
                              {isExpanded && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 whitespace-nowrap">
                                  再次点击应用
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-zinc-400 mt-1 font-medium">{item.theme}</p>
                          </div>
                          <div className="flex flex-wrap gap-1 justify-end flex-shrink-0">
                            {item.keywords.slice(0, isExpanded ? 6 : 3).map((k, kIdx) => (
                              <span key={kIdx} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/40 text-zinc-300 border border-white/5 whitespace-nowrap">
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="space-y-3 overflow-hidden"
                            >
                              <div className="grid grid-cols-1 gap-3 text-sm text-zinc-300 bg-black/30 p-4 rounded-lg">
                                <div>
                                  <span className="text-zinc-500 font-medium">主角设定：</span>
                                  <p className="mt-1 text-zinc-200">{item.protagonist}</p>
                                </div>
                                <div>
                                  <span className="text-zinc-500 font-medium">世界观：</span>
                                  <p className="mt-1 text-zinc-200">{item.worldSetting}</p>
                                </div>
                                {item.hook && (
                                  <div>
                                    <span className="text-zinc-500 font-medium">核心卖点：</span>
                                    <p className="mt-1 text-emerald-300">{item.hook}</p>
                                  </div>
                                )}
                                {item.potential && (
                                  <div>
                                    <span className="text-zinc-500 font-medium">商业潜力：</span>
                                    <p className="mt-1 text-amber-300">{item.potential}</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-500"
                                  leftIcon="✓"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(item);
                                  }}
                                >
                                  应用此灵感
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {!isExpanded && (
                          <div className="space-y-2 text-sm text-zinc-300 bg-black/20 p-3 rounded-lg">
                            <p className="line-clamp-1"><span className="text-zinc-500">主角：</span>{item.protagonist}</p>
                            <p className="line-clamp-1"><span className="text-zinc-500">世界：</span>{item.worldSetting}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

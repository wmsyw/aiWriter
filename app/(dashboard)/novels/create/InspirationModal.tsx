'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import Modal from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { useJobPolling } from '@/app/lib/hooks/useJobPolling';
import { parseJobResponse } from '@/src/shared/jobs';
import {
  INSPIRATION_AUDIENCE_OPTIONS,
  INSPIRATION_PERSPECTIVE_OPTIONS,
  INSPIRATION_PROGRESS_MESSAGES,
  INSPIRATION_STYLE_OPTIONS,
  INSPIRATION_TONE_OPTIONS,
  buildInspirationCacheKey,
  buildInspirationKeywordsPrompt,
  normalizeInspirationList,
  type Inspiration,
} from '@/src/shared/inspiration';

interface InspirationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (inspiration: Inspiration) => void;
  onSelectAndCreate?: (inspiration: Inspiration) => void;
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

const CACHE_MAX_SIZE = 50;
const inspirationCache = new Map<string, Inspiration[]>();

function setCacheWithLimit(key: string, value: Inspiration[]): void {
  if (inspirationCache.size >= CACHE_MAX_SIZE) {
    const firstKey = inspirationCache.keys().next().value;
    if (firstKey) inspirationCache.delete(firstKey);
  }
  inspirationCache.set(key, value);
}

export default function InspirationModal({
  isOpen,
  onClose,
  onSelect,
  onSelectAndCreate,
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
  const criteriaRef = useRef({
    genre,
    targetWords,
    audience,
    keywords,
    style,
    tone,
    perspective,
  });

  const { data, status, error, startPolling, stopPolling } = useJobPolling<Inspiration[]>();

  useEffect(() => {
    criteriaRef.current = {
      genre,
      targetWords,
      audience,
      keywords,
      style,
      tone,
      perspective,
    };
  }, [genre, targetWords, audience, keywords, style, tone, perspective]);

  const getCurrentCacheKey = useCallback(() => {
    return buildInspirationCacheKey(criteriaRef.current);
  }, []);

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startProgressMessages = useCallback(() => {
    progressIndexRef.current = 0;
    setProgressMessage(INSPIRATION_PROGRESS_MESSAGES[0]);
    
    progressIntervalRef.current = setInterval(() => {
      progressIndexRef.current = Math.min(
        progressIndexRef.current + 1,
        INSPIRATION_PROGRESS_MESSAGES.length - 1
      );
      setProgressMessage(INSPIRATION_PROGRESS_MESSAGES[progressIndexRef.current]);
    }, 3000);
  }, []);

  useEffect(() => {
    if (status === 'completed' && data) {
      clearProgressInterval();
      const result = normalizeInspirationList(data);
      if (result.length === 0) {
        setErrorMessage('AI 返回结果为空或格式异常，请重试');
        setStep('settings');
        return;
      }
      setInspirations(result);
      
      setCacheWithLimit(getCurrentCacheKey(), result);
      
      setStep('results');
    } else if (status === 'failed' && error) {
      clearProgressInterval();
      setErrorMessage(error);
      setTimeout(() => {
        setStep('settings');
        setErrorMessage('');
      }, 3000);
    }
  }, [status, data, error, clearProgressInterval, getCurrentCacheKey]);

  useEffect(() => {
    if (isOpen) {
      const cached = inspirationCache.get(getCurrentCacheKey());

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
  }, [isOpen, stopPolling, clearProgressInterval, getCurrentCacheKey]);

  const handleGenerate = async () => {
    setStep('generating');
    setErrorMessage('');
    setExpandedIndex(null);
    startProgressMessages();

    const fullKeywords = buildInspirationKeywordsPrompt({
      keywords,
      style,
      tone,
      perspective,
    });

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
      
      const payload = await res.json();
      const job = parseJobResponse(payload);
      if (!job) {
        throw new Error('任务创建失败：返回数据异常');
      }
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
    inspirationCache.delete(getCurrentCacheKey());
    setStep('settings');
    setInspirations([]);
    setExpandedIndex(null);
  };

  const handleCardClick = (idx: number) => {
    if (expandedIndex === idx) {
      const selected = inspirations[idx];
      if (selected) onSelect(selected);
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
                    options={INSPIRATION_AUDIENCE_OPTIONS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">写作风格</label>
                  <Select
                    value={style}
                    onChange={setStyle}
                    options={INSPIRATION_STYLE_OPTIONS}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">情感基调</label>
                  <Select
                    value={tone}
                    onChange={setTone}
                    options={INSPIRATION_TONE_OPTIONS}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">叙事视角</label>
                  <Select
                    value={perspective}
                    onChange={setPerspective}
                    options={INSPIRATION_PERSPECTIVE_OPTIONS}
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

                              <div className="flex justify-end gap-2">
                                {onSelectAndCreate && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="border-emerald-500/30 text-emerald-200 hover:text-emerald-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectAndCreate(item);
                                    }}
                                  >
                                    应用并创建
                                  </Button>
                                )}
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

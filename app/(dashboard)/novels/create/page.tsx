'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn, slideInRight, slideUp, staggerContainer, smoothTransition, scaleIn } from '@/app/lib/animations';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Checkbox } from '@/app/components/ui/Checkbox';
import { Card, CardContent } from '@/app/components/ui/Card';
import { Select } from '@/app/components/ui/Select';
import { Progress } from '@/app/components/ui/Progress';
import Modal, { ConfirmModal } from '@/app/components/ui/Modal';
import InspirationModal from './InspirationModal';
import { useToast } from '@/app/components/ui/Toast';
import {
  formatKeywordsInput,
  parseKeywordsInput,
  type Inspiration,
} from '@/src/shared/inspiration';
import {
  WIZARD_PHASE_LABEL,
  WIZARD_PHASE_PROGRESS,
  mapJobStatusToWizardPhase,
  type WizardPhase,
} from '@/src/shared/wizard-phase';
import { pollJobUntilTerminal } from '@/app/lib/jobs/polling';
import { parseJobResponse } from '@/src/shared/jobs';

const GENRES = ['玄幻', '仙侠', '都市', '历史', '科幻', '游戏', '悬疑', '奇幻', '武侠', '言情', '其他'];
const OUTLINE_MODES = [
  { id: 'simple', label: '简版大纲' },
  { id: 'detailed', label: '详细大纲' },
];
const DEFAULT_CONTINUITY_GATE = {
  enabled: true,
  passScore: 6.8,
  rejectScore: 4.9,
  maxRepairAttempts: 1,
};
type CreationMode = 'inspiration' | 'manual';

interface NovelFormState {
  title: string;
  description: string;
  type: 'long';
  theme: string;
  genre: string;
  targetWords: number;
  chapterCount: number;
  protagonist: string;
  worldSetting: string;
  goldenFinger: string;
  keywords: string[];
  keywordsInput: string;
  creativeIntent: string;
  specialRequirements: string;
  outlineMode: string;
  continuityGateEnabled: boolean;
  continuityPassScore: number;
  continuityRejectScore: number;
  continuityMaxRepairAttempts: number;
}

const CREATION_MODE_META: Record<CreationMode, { title: string; description: string }> = {
  inspiration: {
    title: '通过灵感生成创建',
    description: '先挑选灵感，再自动回填核心设定，适合没想好方向时快速开书。',
  },
  manual: {
    title: '自行创建',
    description: '手动填写题材与设定，自由度最高，适合已有清晰构思。',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

// Outline types removed

// OutlineTreeNode component removed

function NovelWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const presetTitle = searchParams.get('title') || '';
  const presetDescription = searchParams.get('description') || '';
  const initialNovelId = searchParams.get('novelId');
  const presetCreationMode = searchParams.get('creationMode');
  const initialCreationMode: CreationMode | null =
    presetCreationMode === 'inspiration' || presetCreationMode === 'manual'
      ? presetCreationMode
      : null;

  const [step, setStep] = useState(0);
  const [novelId, setNovelId] = useState<string | null>(initialNovelId);
  const [isSaving, setIsSaving] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>('idle');
// Unused outline states removed
  const [autoGenerating, setAutoGenerating] = useState(false);
  const pollingAbortRef = useRef<AbortController | null>(null);
  const [creationMode, setCreationMode] = useState<CreationMode | null>(
    initialNovelId ? (initialCreationMode || 'manual') : initialCreationMode
  );
  const [selectedInspiration, setSelectedInspiration] = useState<Inspiration | null>(null);

  const [formData, setFormData] = useState<NovelFormState>({
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
    creativeIntent: '',
    specialRequirements: '',
    outlineMode: 'simple',
    continuityGateEnabled: DEFAULT_CONTINUITY_GATE.enabled,
    continuityPassScore: DEFAULT_CONTINUITY_GATE.passScore,
    continuityRejectScore: DEFAULT_CONTINUITY_GATE.rejectScore,
    continuityMaxRepairAttempts: DEFAULT_CONTINUITY_GATE.maxRepairAttempts,
  });
  const shouldChooseCreationMode = !novelId && !creationMode;

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
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = null;
  }, []);

  const keywordsDisplay = useMemo(() => formData.keywords.join('、'), [formData.keywords]);

  const setField = <K extends keyof NovelFormState>(key: K, value: NovelFormState[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const resolveKeywordsFromForm = (data: NovelFormState) => {
    const parsed = parseKeywordsInput(data.keywordsInput);
    return parsed.length > 0 ? parsed : data.keywords;
  };

  const resolveKeywords = () => {
    return resolveKeywordsFromForm(formData);
  };

  const updateWizardPhase = (phase: WizardPhase, message: string) => {
    setWizardPhase(phase);
    setJobStatus(message);
  };

  const resetWizardPhase = () => {
    setWizardPhase('idle');
    setJobStatus('');
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
    return saveNovel(false, { preserveStatus: true });
  };

  const buildInspirationPatch = (
    inspiration: Inspiration,
    current: NovelFormState,
  ): Partial<NovelFormState> => ({
    title: current.title || inspiration.name,
    theme: inspiration.theme,
    ...(inspiration.synopsis
      ? {
          description: inspiration.synopsis,
        }
      : {}),
    protagonist: inspiration.protagonist,
    worldSetting: inspiration.worldSetting,
    keywords: inspiration.keywords,
    keywordsInput: formatKeywordsInput(inspiration.keywords),
    ...(inspiration.goldenFinger
      ? {
          goldenFinger: inspiration.goldenFinger,
        }
      : {}),
  });

  const handleSelectCreationMode = (mode: CreationMode) => {
    setCreationMode(mode);
    if (mode === 'manual') {
      setSelectedInspiration(null);
      return;
    }
    setIsInspirationModalOpen(true);
  };

  const ensureCreationModeBeforeSave = () => {
    if (novelId) return true;
    if (!creationMode) {
      toast({
        variant: 'warning',
        description: '请先选择创建方式（灵感创建或自行创建）。',
      });
      return false;
    }
    if (creationMode === 'inspiration' && !selectedInspiration) {
      toast({
        variant: 'warning',
        description: '灵感创建模式下，请先选择并应用一个灵感。',
      });
      setIsInspirationModalOpen(true);
      return false;
    }
    return true;
  };

  const handleInspirationSelect = (inspiration: Inspiration) => {
    const patch = buildInspirationPatch(inspiration, formData);
    setFormData(prev => ({ ...prev, ...patch }));
    setCreationMode('inspiration');
    setSelectedInspiration(inspiration);
    setIsInspirationModalOpen(false);
  };

  const handleInspirationSelectAndCreate = async (inspiration: Inspiration) => {
    const patch = buildInspirationPatch(inspiration, formData);
    setFormData(prev => ({ ...prev, ...patch }));
    setCreationMode('inspiration');
    setSelectedInspiration(inspiration);
    setIsInspirationModalOpen(false);

    if (novelId) return;

    await saveNovel(true, {
      overrideFields: patch,
      selectedInspiration: inspiration,
    });
  };
  
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

  type SaveNovelOptions = {
    preserveStatus?: boolean;
    overrideFields?: Partial<NovelFormState>;
    selectedInspiration?: Inspiration | null;
  };

  const saveNovel = async (advanceStep: boolean = true, options: SaveNovelOptions = {}) => {
    const effectiveForm: NovelFormState = {
      ...formData,
      ...(options.overrideFields || {}),
    };
    if (!effectiveForm.title.trim()) return null;
    setIsSaving(true);
    updateWizardPhase('saving', '保存基础信息中...');

    const normalizedKeywords = resolveKeywordsFromForm(effectiveForm);
    const continuityPassScore = Number(
      clamp(effectiveForm.continuityPassScore, 4.5, 9.5).toFixed(2)
    );
    const continuityRejectScore = Number(
      clamp(effectiveForm.continuityRejectScore, 3.5, continuityPassScore - 0.4).toFixed(2)
    );
    const continuityMaxRepairAttempts = clamp(
      Math.floor(effectiveForm.continuityMaxRepairAttempts || 0),
      0,
      5
    );
    const resolvedCreationMode = creationMode || 'manual';
    const resolvedSelectedInspiration = options.selectedInspiration ?? selectedInspiration;

    const payload = {
      title: effectiveForm.title,
      description: effectiveForm.description,
      type: effectiveForm.type,
      theme: effectiveForm.theme || undefined,
      genre: effectiveForm.genre || undefined,
      targetWords: effectiveForm.targetWords || undefined,
      chapterCount: effectiveForm.chapterCount || undefined,
      protagonist: effectiveForm.protagonist || undefined,
      worldSetting: effectiveForm.worldSetting || undefined,
      goldenFinger: effectiveForm.goldenFinger || undefined,
      keywords: normalizedKeywords,
      creativeIntent: effectiveForm.creativeIntent || undefined,
      specialRequirements: effectiveForm.specialRequirements || undefined,
      outlineMode: effectiveForm.outlineMode,
      inspirationData: {
        creationMode: resolvedCreationMode,
        keywords: normalizedKeywords,
        ...(resolvedCreationMode === 'inspiration' && resolvedSelectedInspiration
          ? { selectedInspiration: resolvedSelectedInspiration }
          : {}),
      },
      workflowConfig: {
        continuityGate: {
          enabled: effectiveForm.continuityGateEnabled,
          passScore: continuityPassScore,
          rejectScore: continuityRejectScore,
          maxRepairAttempts: continuityMaxRepairAttempts,
        },
      },
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
      updateWizardPhase('error', '基础信息保存失败');
      return null;
    } finally {
      setIsSaving(false);
      if (!options.preserveStatus) {
        resetWizardPhase();
      }
    }
  };

  const handleSaveBasicInfo = () => {
    if (!ensureCreationModeBeforeSave()) return;
    return saveNovel(true);
  };

  const runJob = async (
    type: string,
    input: Record<string, unknown>,
    onStatusChange?: (status: string) => void,
  ) => {
    updateWizardPhase('preparing', '正在准备生成任务...');
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
    const payload = await res.json();
    const job = parseJobResponse(payload);
    if (!job) {
      throw new Error('任务创建失败：返回数据异常');
    }

    pollingAbortRef.current?.abort();
    const controller = new AbortController();
    pollingAbortRef.current = controller;

    updateWizardPhase('queued', '任务已入队，等待调度...');

    try {
      return await pollJobUntilTerminal(job.id, {
        intervalMs: 2000,
        maxAttempts: 300,
        signal: controller.signal,
        timeoutMessage: '生成超时 (超过10分钟)',
        failedMessage: '生成失败',
        onStatusChange: (status) => onStatusChange?.(status),
      });
    } finally {
      if (pollingAbortRef.current === controller) {
        pollingAbortRef.current = null;
      }
    }
  };

  const startNovelSeed = async (overrideId?: string): Promise<SeedOutput | undefined> => {
    const idToUse = overrideId || novelId;
    if (!idToUse) return;
    updateWizardPhase('preparing', '开始统一生成基础设定...');

    try {
      const output = await runJob('NOVEL_SEED', {
        novelId: idToUse,
        title: formData.title,
        theme: formData.theme,
        genre: formData.genre,
        keywords: formatKeywordsInput(resolveKeywords()),
        protagonist: formData.protagonist,
        creativeIntent: formData.creativeIntent,
        specialRequirements: formData.specialRequirements,
      }, (status) => {
        const mappedPhase = mapJobStatusToWizardPhase(status);
        if (mappedPhase === 'queued') {
          updateWizardPhase('queued', '任务排队中...');
          return;
        }
        if (mappedPhase === 'generating') {
          updateWizardPhase('generating', 'AI 正在统一生成基础设定...');
          return;
        }
        if (mappedPhase === 'error') {
          updateWizardPhase('error', '基础设定生成任务失败');
        }
      }) as SeedOutput;
      updateWizardPhase('parsing', '正在解析生成结果...');

      const world = output?.world || {};
      setFormData(prev => ({
        ...prev,
        description: output?.synopsis || prev.description,
        protagonist: output?.protagonist || prev.protagonist,
        goldenFinger: output?.golden_finger || prev.goldenFinger,
        worldSetting: world.world_setting || prev.worldSetting,
      }));

      updateWizardPhase('saving', '正在写入生成结果...');
      await patchNovelFields(idToUse, {
        description: output?.synopsis || undefined,
        protagonist: output?.protagonist || undefined,
        goldenFinger: output?.golden_finger || undefined,
        worldSetting: world.world_setting || undefined,
      });
      updateWizardPhase('complete', '基础设定统一生成完成');
      return output;
    } catch (error) {
      console.error('Failed to generate seed data', error);
      updateWizardPhase('error', error instanceof Error ? error.message : '生成失败');
      throw error;
    }
  };

  const handleAutoGenerateCoreSetup = async () => {
    if (!ensureCreationModeBeforeSave()) return;

    if (!formData.title.trim()) {
      toast({
        variant: 'warning',
        description: '请先填写书名',
      });
      return;
    }

    let success = false;
    setAutoGenerating(true);
    try {
      updateWizardPhase('preparing', '正在准备创建并生成...');
      const id = await ensureNovelId();
      if (!id) {
        throw new Error('创建小说失败，请重试');
      }

      await startNovelSeed(id);
      success = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '一键生成失败';
      updateWizardPhase('error', msg);
      toast({
        variant: 'error',
        title: '一键生成失败',
        description: msg,
      });
    } finally {
      setAutoGenerating(false);
      if (success) {
        setTimeout(() => resetWizardPhase(), 1500);
      }
    }
  };

// Outline generation logic removed as it's now handled in the workbench

  return (
    <div className="min-h-[calc(100vh-var(--dashboard-topbar-height)-3rem)] space-y-10 pb-10">
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
        onSelectAndCreate={!novelId ? handleInspirationSelectAndCreate : undefined}
        genre={formData.genre}
        targetWords={formData.targetWords}
      />
      
      {/* Header */}
      <div className="page-header items-start gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">
            {novelId ? '完善你的故事' : '开启新篇章'}
          </h1>
          <p className="text-gray-400 mt-2">AI 辅助创作向导，从灵感到大纲只需几步</p>
        </div>
        {novelId && (
          <Button
            variant="secondary"
            size="sm"
            className="px-4"
            onClick={() => router.push(`/novels/${novelId}`)}
          >
            退出向导
          </Button>
        )}
      </div>

      {!novelId && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">创建方式</h2>
              <p className="text-sm text-zinc-400 mt-1">
                先选择创建方式，再继续填写设定并创建小说。
              </p>
              {creationMode && (
                <p className="text-xs text-emerald-300 mt-2">
                  当前：{CREATION_MODE_META[creationMode].title}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto">
              <Button
                type="button"
                variant={creationMode === 'inspiration' ? 'primary' : 'secondary'}
                className="h-auto min-h-[64px] justify-start px-4 py-3 text-left"
                onClick={() => handleSelectCreationMode('inspiration')}
              >
                <div className="space-y-1">
                  <div className="font-semibold">{CREATION_MODE_META.inspiration.title}</div>
                  <div className="text-xs text-zinc-300/90">
                    {CREATION_MODE_META.inspiration.description}
                  </div>
                </div>
              </Button>
              <Button
                type="button"
                variant={creationMode === 'manual' ? 'primary' : 'secondary'}
                className="h-auto min-h-[64px] justify-start px-4 py-3 text-left"
                onClick={() => handleSelectCreationMode('manual')}
              >
                <div className="space-y-1">
                  <div className="font-semibold">{CREATION_MODE_META.manual.title}</div>
                  <div className="text-xs text-zinc-300/90">
                    {CREATION_MODE_META.manual.description}
                  </div>
                </div>
              </Button>
            </div>
          </div>
          {creationMode === 'inspiration' && !selectedInspiration && (
            <p className="text-xs text-amber-300">
              当前为灵感创建模式，请先在“AI 生成灵感”中应用一个灵感，再执行创建。
            </p>
          )}
        </Card>
      )}

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
              <Button
                key={label}
                type="button"
                variant="ghost"
                size="sm"
                className={`z-10 h-auto min-h-0 flex-col items-center gap-2 rounded-none border-0 bg-transparent p-0 text-current shadow-none transition-colors hover:bg-transparent ${
                  index < step ? 'cursor-pointer' : 'cursor-default'
                } disabled:opacity-100 disabled:pointer-events-none`}
                onClick={() => index < step && setStep(index)}
                disabled={index >= step}
                aria-current={isActive ? 'step' : undefined}
              >
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
              </Button>
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
                        disabled={
                          autoGenerating ||
                          isSaving ||
                          !formData.title.trim() ||
                          shouldChooseCreationMode ||
                          (creationMode === 'inspiration' && !selectedInspiration)
                        }
                        isLoading={autoGenerating}
                        loadingText="生成中..."
                        leftIcon="✨"
                      >
                        统一生成基础设定
                      </Button>
                    </div>
                    <p className="text-xs text-emerald-300/80">
                      统一生成会一次性产出简介、世界观、主角与金手指，保证设定风格一致。
                    </p>
                    {(autoGenerating || wizardPhase !== 'idle' || !!jobStatus) && (
                      <div className={`space-y-2 rounded-xl border p-3 ${
                        wizardPhase === 'error'
                          ? 'border-red-500/30 bg-red-500/10'
                          : 'border-emerald-500/25 bg-emerald-500/10'
                      }`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={wizardPhase === 'error' ? 'text-red-300' : 'text-emerald-300'}>
                            当前阶段：{WIZARD_PHASE_LABEL[wizardPhase]}
                          </span>
                          <span className={wizardPhase === 'error' ? 'text-red-300/80' : 'text-emerald-300/80'}>
                            {WIZARD_PHASE_PROGRESS[wizardPhase]}%
                          </span>
                        </div>
                        <Progress
                          value={WIZARD_PHASE_PROGRESS[wizardPhase]}
                          indicatorClassName={wizardPhase === 'error' ? 'bg-gradient-to-r from-red-500 to-red-600' : undefined}
                        />
                        {jobStatus && (
                          <p className={`text-xs ${wizardPhase === 'error' ? 'text-red-200' : 'text-emerald-200/90'}`}>
                            {jobStatus}
                          </p>
                        )}
                      </div>
                    )}
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
                        <label className="text-sm font-medium text-gray-300">一句话简介</label>
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
                      <label className="text-sm font-medium text-gray-300">世界观</label>
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
                        onBlur={(e) => setField('keywords', parseKeywordsInput(e.target.value))}
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
                        <label className="text-sm font-medium text-gray-300">主角人设</label>
                        <Textarea
                          className="min-h-[100px]"
                          value={formData.protagonist}
                          onChange={e => setField('protagonist', e.target.value)}
                          placeholder="主角姓名、性格、成长路径..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">金手指</label>
                        <Textarea
                          className="min-h-[80px]"
                          value={formData.goldenFinger}
                          onChange={e => setField('goldenFinger', e.target.value)}
                          placeholder="外挂/系统/特殊能力..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">创作意图（作者目标）</label>
                        <Textarea
                          className="min-h-[80px]"
                          value={formData.creativeIntent}
                          onChange={e => setField('creativeIntent', e.target.value)}
                          placeholder="例如：强调成长线与群像，避免降智冲突，整体基调偏克制现实主义..."
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
                            <Button
                              key={preset}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setField('targetWords', preset);
                                // Auto-adjust chapter count based on word count (avg 3000 words per chapter)
                                setField('chapterCount', Math.round(preset * 10000 / 3000));
                              }}
                              className={`h-9 rounded-lg border whitespace-nowrap transition-all duration-200 ${
                                formData.targetWords === preset
                                  ? 'border-emerald-500/45 bg-emerald-500/25 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                  : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/10 hover:text-gray-200'
                              }`}
                            >
                              {preset}万
                            </Button>
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
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-gray-400">连续性门禁</label>
                          <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                            <Checkbox
                              checked={formData.continuityGateEnabled}
                              onChange={(e) => setField('continuityGateEnabled', e.target.checked)}
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500"
                            />
                            启用
                          </label>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <Input
                            type="number"
                            step={0.1}
                            min={1}
                            max={10}
                            disabled={!formData.continuityGateEnabled}
                            label="通过阈值"
                            className="h-9 text-right font-mono text-emerald-300"
                            value={formData.continuityPassScore}
                            onChange={e => setField('continuityPassScore', Number(e.target.value))}
                          />
                          <Input
                            type="number"
                            step={0.1}
                            min={1}
                            max={10}
                            disabled={!formData.continuityGateEnabled}
                            label="拒绝阈值"
                            className="h-9 text-right font-mono text-emerald-300"
                            value={formData.continuityRejectScore}
                            onChange={e => setField('continuityRejectScore', Number(e.target.value))}
                          />
                          <Input
                            type="number"
                            min={0}
                            max={5}
                            disabled={!formData.continuityGateEnabled}
                            label="自动修复次数"
                            className="h-9 text-right font-mono text-emerald-300"
                            value={formData.continuityMaxRepairAttempts}
                            onChange={e => setField('continuityMaxRepairAttempts', Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-white/5">
                <Button
                  variant="primary"
                  size="lg"
                  className="px-8 shadow-emerald-500/20"
                  disabled={isSaving || shouldChooseCreationMode}
                  isLoading={isSaving}
                  loadingText="创建中..."
                  onClick={handleSaveBasicInfo}
                >
                  {shouldChooseCreationMode
                    ? '请选择创建方式'
                    : creationMode === 'inspiration' && !selectedInspiration
                      ? '请先应用灵感'
                      : '创建小说'}
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

'use client';

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import GlassCard from '@/app/components/ui/GlassCard';
import Modal, { ConfirmModal, ModalFooter } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { Select } from '@/app/components/ui/Select';
import HookTimeline from '@/app/components/HookTimeline';
import { useFetch } from '@/src/hooks/useFetch';
import {
  buildOverdueHookMap,
  filterAndSortHooks,
  getHooksCurrentChapter,
  type HookImportance,
  type HookStatus,
  type HookType,
  type NarrativeHookRecord,
  type OverdueHookWarningRecord,
} from '@/src/shared/hooks';

interface NarrativeHook extends NarrativeHookRecord {
  id: string;
  type: HookType;
  description: string;
  plantedInChapter: number;
  plantedContext?: string;
  referencedInChapters: number[];
  resolvedInChapter?: number;
  resolutionContext?: string;
  status: HookStatus;
  importance: HookImportance;
  expectedResolutionBy?: number;
  reminderThreshold: number;
  relatedCharacters: string[];
  notes?: string;
  createdAt: string;
}

interface HooksReport {
  totalPlanted: number;
  totalResolved: number;
  totalUnresolved: number;
  totalAbandoned: number;
  resolutionRate: number;
  averageResolutionChapters: number;
  hooksByType: Record<string, number>;
  hooksByImportance: Record<string, number>;
  unresolvedByImportance: { critical: number; major: number; minor: number };
}

type HookAction = 'resolve' | 'abandon' | 'reference';
type BatchAction = HookAction | 'delete';

type FlashType = 'success' | 'error';

interface FlashMessage {
  type: FlashType;
  text: string;
}

interface HookFormPayload {
  type: HookType;
  description: string;
  plantedInChapter: number;
  plantedContext?: string;
  importance: HookImportance;
  expectedResolutionBy?: number;
  reminderThreshold?: number;
  relatedCharacters: string[];
  relatedOrganizations: string[];
  notes?: string;
}

const STATUS_TABS: { id: HookStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'planted', label: '已埋设' },
  { id: 'referenced', label: '已引用' },
  { id: 'resolved', label: '已解决' },
  { id: 'abandoned', label: '已放弃' },
];

const HOOK_TYPES: { id: HookType; label: string; icon: string }[] = [
  { id: 'foreshadowing', label: '伏笔', icon: '🔮' },
  { id: 'chekhov_gun', label: '契诃夫之枪', icon: '🔫' },
  { id: 'mystery', label: '悬念', icon: '❓' },
  { id: 'promise', label: '承诺', icon: '🤞' },
  { id: 'setup', label: '铺垫', icon: '🧱' },
];

const IMPORTANCE_LEVELS: { id: HookImportance; label: string; color: string; bg: string }[] = [
  { id: 'critical', label: '关键', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  { id: 'major', label: '重要', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  { id: 'minor', label: '次要', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
];

const SORT_OPTIONS = [
  { value: 'priority', label: '智能优先级' },
  { value: 'latest', label: '最近埋设优先' },
  { value: 'expected', label: '预期回收优先' },
] as const;

type SortMode = (typeof SORT_OPTIONS)[number]['value'];

function parseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function HooksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: novelId } = use(params);

  const { data: hooks, isLoading, refetch } = useFetch<NarrativeHook[]>(`/api/novels/${novelId}/hooks`, {
    initialData: [],
    transform: (payload) => {
      if (
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { hooks?: unknown }).hooks)
      ) {
        return (payload as { hooks: NarrativeHook[] }).hooks;
      }
      return [];
    },
  });

  const { data: reportData } = useFetch<{ report: HooksReport }>(`/api/novels/${novelId}/hooks/report`);

  const [activeTab, setActiveTab] = useState<HookStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | HookType>('all');
  const [importanceFilter, setImportanceFilter] = useState<'all' | HookImportance>('all');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<NarrativeHook | null>(null);
  const [actionModal, setActionModal] = useState<{ hook: NarrativeHook; action: HookAction } | null>(null);
  const [batchActionModal, setBatchActionModal] = useState<{
    action: Exclude<BatchAction, 'delete'>;
    hookIds: string[];
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; title: string; message: string } | null>(null);

  const [selectedHookIds, setSelectedHookIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const hooksList = Array.isArray(hooks) ? hooks : [];
  const currentChapter = useMemo(() => getHooksCurrentChapter(hooksList), [hooksList]);
  const { data: overdueWarnings, refetch: refetchOverdue } = useFetch<OverdueHookWarningRecord[]>(
    `/api/novels/${novelId}/hooks/overdue?currentChapter=${currentChapter}`,
    {
      initialData: [],
      transform: (payload) => {
        if (
          payload &&
          typeof payload === 'object' &&
          Array.isArray((payload as { warnings?: unknown }).warnings)
        ) {
          return (payload as { warnings: OverdueHookWarningRecord[] }).warnings;
        }
        return [];
      },
    }
  );

  const report = reportData?.report;
  const overdueMap = useMemo(
    () => buildOverdueHookMap(Array.isArray(overdueWarnings) ? overdueWarnings : []),
    [overdueWarnings]
  );

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2800);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const idSet = new Set(hooksList.map((hook) => hook.id));
    setSelectedHookIds((prev) => prev.filter((id) => idSet.has(id)));
  }, [hooksList]);

  const filteredHooks = useMemo(() => {
    const base = filterAndSortHooks(hooksList, {
      activeTab,
      searchQuery,
      overdueMap,
    });

    const refined = base.filter((hook) => {
      if (typeFilter !== 'all' && hook.type !== typeFilter) return false;
      if (importanceFilter !== 'all' && hook.importance !== importanceFilter) return false;
      if (showOverdueOnly && !overdueMap.has(hook.id)) return false;
      return true;
    });

    if (sortMode === 'latest') {
      return [...refined].sort((a, b) => (b.plantedInChapter || 0) - (a.plantedInChapter || 0));
    }

    if (sortMode === 'expected') {
      return [...refined].sort((a, b) => {
        const aExpected = a.expectedResolutionBy ?? Number.MAX_SAFE_INTEGER;
        const bExpected = b.expectedResolutionBy ?? Number.MAX_SAFE_INTEGER;
        if (aExpected !== bExpected) return aExpected - bExpected;
        return (a.plantedInChapter || 0) - (b.plantedInChapter || 0);
      });
    }

    return refined;
  }, [activeTab, hooksList, importanceFilter, overdueMap, searchQuery, showOverdueOnly, sortMode, typeFilter]);

  const selectedSet = useMemo(() => new Set(selectedHookIds), [selectedHookIds]);
  const visibleIds = useMemo(() => filteredHooks.map((hook) => hook.id), [filteredHooks]);
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selectedSet.has(id)).length,
    [visibleIds, selectedSet]
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;

  const refreshAll = async () => {
    await Promise.all([refetch(), refetchOverdue()]);
  };

  const handleCreateOrUpdate = async (payload: HookFormPayload, hookId?: string) => {
    setIsSubmitting(true);
    try {
      const url = hookId
        ? `/api/novels/${novelId}/hooks/${hookId}`
        : `/api/novels/${novelId}/hooks`;
      const method = hookId ? 'PATCH' : 'POST';
      const body = hookId ? { action: 'update_meta', ...payload } : payload;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '保存失败');
      }

      await refreshAll();
      setIsModalOpen(false);
      setEditingHook(null);
      setFlash({ type: 'success', text: hookId ? '钩子已更新' : '钩子已创建' });
    } catch (error) {
      setFlash({ type: 'error', text: parseErrorMessage(error, hookId ? '更新钩子失败' : '创建钩子失败') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (hookId: string, action: HookAction, data: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/novels/${novelId}/hooks/${hookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '操作失败');
      }

      await refreshAll();
      setActionModal(null);
      setFlash({ type: 'success', text: '钩子状态已更新' });
    } catch (error) {
      setFlash({ type: 'error', text: parseErrorMessage(error, '更新钩子状态失败') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchAction = async (
    action: BatchAction,
    hookIds: string[],
    data: Record<string, unknown> = {}
  ) => {
    if (hookIds.length === 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/novels/${novelId}/hooks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, hookIds, ...data }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '批量操作失败');
      }

      await refreshAll();
      setSelectedHookIds((prev) => prev.filter((id) => !hookIds.includes(id)));
      setBatchActionModal(null);
      setConfirmDelete(null);
      setFlash({
        type: 'success',
        text: action === 'delete' ? `已删除 ${hookIds.length} 个钩子` : `已批量更新 ${hookIds.length} 个钩子`,
      });
    } catch (error) {
      setFlash({ type: 'error', text: parseErrorMessage(error, '批量操作失败，请重试') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSelect = (hookId: string, checked: boolean) => {
    setSelectedHookIds((prev) => {
      if (checked) {
        if (prev.includes(hookId)) return prev;
        return [...prev, hookId];
      }
      return prev.filter((id) => id !== hookId);
    });
  };

  const handleToggleSelectVisible = () => {
    if (allVisibleSelected) {
      setSelectedHookIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedHookIds((prev) => {
      const merged = new Set([...prev, ...visibleIds]);
      return [...merged];
    });
  };

  const selectedHooks = useMemo(
    () => hooksList.filter((hook) => selectedSet.has(hook.id)),
    [hooksList, selectedSet]
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in min-h-screen pb-24">
      <div className="flex flex-col gap-6">
        <Link
          href={`/novels/${novelId}`}
          className="inline-flex items-center gap-2 w-fit text-gray-400 hover:text-white transition-colors group text-sm font-medium"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] group-hover:bg-white/10 transition-colors">
            <svg
              className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </span>
          返回小说
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="text-4xl">🎣</span> 叙事钩子管理
            </h1>
            <p className="text-gray-400 max-w-2xl">
              统一管理伏笔、悬念与承诺，支持批量推进、逾期追踪、元信息编辑，保障长篇剧情的连续性和回收节奏。
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingHook(null);
              setIsModalOpen(true);
            }}
            className="px-6"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加新钩子
          </Button>
        </div>
      </div>

      {flash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.type === 'success'
              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200'
              : 'border-red-500/35 bg-red-500/12 text-red-200'
          }`}
        >
          {flash.text}
        </div>
      )}

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="未解决"
            value={report.totalUnresolved}
            color="text-yellow-400"
            bg="bg-yellow-500/10"
            border="border-yellow-500/20"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="已解决"
            value={report.totalResolved}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
            border="border-emerald-500/20"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            }
          />
          <StatCard
            label="解决率"
            value={`${(report.resolutionRate * 100).toFixed(0)}%`}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
            border="border-emerald-500/20"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            }
          />
          <StatCard
            label="平均跨度"
            value={`${report.averageResolutionChapters.toFixed(1)} 章`}
            color="text-purple-400"
            bg="bg-purple-500/10"
            border="border-purple-500/20"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
          />
        </div>
      )}

      {report && report.unresolvedByImportance.critical > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-4 animate-pulse">
          <div className="bg-red-500/20 p-2 rounded-full">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-red-400 font-bold">关键钩子未解决</h3>
            <p className="text-red-300/70 text-sm">
              目前有 <strong>{report.unresolvedByImportance.critical}</strong> 个关键钩子未回收，建议优先推进。
            </p>
          </div>
        </div>
      )}

      {Array.isArray(overdueWarnings) && overdueWarnings.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-orange-500/25 bg-orange-500/8 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-orange-300">逾期待回收钩子</h3>
            <span className="rounded-full border border-orange-500/35 bg-orange-500/15 px-2 py-0.5 text-xs text-orange-200">
              {overdueWarnings.length} 个风险项
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {overdueWarnings.slice(0, 6).map((warning) => (
              <div
                key={warning.hookId}
                className="rounded-xl border border-orange-500/20 bg-black/20 px-3 py-2"
              >
                <div className="text-sm font-medium text-orange-100">{warning.description}</div>
                <div className="mt-1 text-xs text-orange-200/75">
                  已超期 {warning.chaptersOverdue} 章 · 埋设于第 {warning.plantedChapter} 章
                </div>
                <div className="mt-1 text-xs text-zinc-400">{warning.suggestedAction}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <HookTimeline hooks={hooksList} />

      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sticky dashboard-sticky-offset z-20 shadow-xl shadow-black/20">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div className="flex overflow-x-auto pb-1 xl:pb-0 gap-1 no-scrollbar">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={`h-9 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <div className="relative w-full xl:w-80 group">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-hover:text-emerald-400 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="搜索描述、备注、角色..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:border-emerald-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Select
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as 'all' | HookType)}
            options={[
              { value: 'all', label: '全部类型' },
              ...HOOK_TYPES.map((item) => ({ value: item.id, label: `${item.icon} ${item.label}` })),
            ]}
            placeholder="类型"
            className="[&_button]:h-9"
          />
          <Select
            value={importanceFilter}
            onChange={(value) => setImportanceFilter(value as 'all' | HookImportance)}
            options={[
              { value: 'all', label: '全部优先级' },
              ...IMPORTANCE_LEVELS.map((item) => ({ value: item.id, label: item.label })),
            ]}
            placeholder="优先级"
            className="[&_button]:h-9"
          />
          <Select
            value={sortMode}
            onChange={(value) => setSortMode(value as SortMode)}
            options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="排序"
            className="[&_button]:h-9"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOverdueOnly((prev) => !prev)}
            className={`h-9 rounded-xl border ${
              showOverdueOnly
                ? 'border-orange-500/35 bg-orange-500/15 text-orange-200 hover:bg-orange-500/20'
                : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/8'
            }`}
          >
            {showOverdueOnly ? '仅看逾期中' : '显示全部（含未逾期）'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="text-xs text-zinc-400">
          当前视图 {filteredHooks.length} 项，已选择 {selectedHookIds.length} 项
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToggleSelectVisible}
            disabled={filteredHooks.length === 0}
            className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
          >
            {allVisibleSelected ? '取消全选当前结果' : '全选当前结果'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedHookIds([])}
            disabled={selectedHookIds.length === 0}
            className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
          >
            清空选择
          </Button>
        </div>
      </div>

      {selectedHookIds.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-wrap items-center gap-2 sticky top-[calc(var(--header-height,4rem)+1rem)] z-30">
          <span className="text-xs text-emerald-100 mr-2">批量操作 {selectedHookIds.length} 项</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setBatchActionModal({ action: 'reference', hookIds: [...selectedHookIds] })}
            className="border border-purple-500/30 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25"
          >
            批量引用
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setBatchActionModal({ action: 'resolve', hookIds: [...selectedHookIds] })}
            className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
          >
            批量解决
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setBatchActionModal({ action: 'abandon', hookIds: [...selectedHookIds] })}
            className="border border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
          >
            批量放弃
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setConfirmDelete({
                ids: [...selectedHookIds],
                title: '批量删除钩子',
                message: `确认删除已选中的 ${selectedHookIds.length} 个钩子吗？该操作不可恢复。`,
              })
            }
            className="border border-red-500/30 bg-red-500/15 text-red-200 hover:bg-red-500/25"
          >
            批量删除
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="glass-card h-48 rounded-2xl animate-pulse bg-white/5" />
          ))}
        </div>
      ) : filteredHooks.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {filteredHooks.map((hook) => (
            <HookCard
              key={hook.id}
              hook={hook}
              selected={selectedSet.has(hook.id)}
              overdueWarning={overdueMap.get(hook.id)}
              onSelect={(checked) => handleToggleSelect(hook.id, checked)}
              onResolve={() => setActionModal({ hook, action: 'resolve' })}
              onAbandon={() => setActionModal({ hook, action: 'abandon' })}
              onReference={() => setActionModal({ hook, action: 'reference' })}
              onEdit={() => {
                setEditingHook(hook);
                setIsModalOpen(true);
              }}
              onDelete={() =>
                setConfirmDelete({
                  ids: [hook.id],
                  title: '删除钩子',
                  message: '确定要删除这个钩子吗？该操作不可恢复。',
                })
              }
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 opacity-50 flex flex-col items-center">
          <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <p className="text-xl font-bold text-gray-300">暂无钩子</p>
          <p className="text-gray-500 mt-2 max-w-sm">没有找到符合条件的叙事钩子。尝试调整筛选条件或创建新的钩子。</p>
        </div>
      )}

      {isModalOpen && (
        <HookEditorModal
          isOpen={isModalOpen}
          hook={editingHook}
          isSaving={isSubmitting}
          onClose={() => {
            setIsModalOpen(false);
            setEditingHook(null);
          }}
          onSave={async (payload) => {
            await handleCreateOrUpdate(payload, editingHook?.id);
          }}
        />
      )}

      {actionModal && (
        <ActionModal
          hook={actionModal.hook}
          action={actionModal.action}
          isSubmitting={isSubmitting}
          onClose={() => setActionModal(null)}
          onConfirm={async (payload) => {
            await handleAction(actionModal.hook.id, actionModal.action, payload);
          }}
        />
      )}

      {batchActionModal && (
        <BatchActionModal
          action={batchActionModal.action}
          selectedCount={batchActionModal.hookIds.length}
          defaultChapter={
            selectedHooks.length > 0
              ? Math.max(...selectedHooks.map((hook) => hook.plantedInChapter || 1)) + 1
              : currentChapter
          }
          isSubmitting={isSubmitting}
          onClose={() => setBatchActionModal(null)}
          onConfirm={async (payload) => {
            await handleBatchAction(batchActionModal.action, batchActionModal.hookIds, payload);
          }}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await handleBatchAction('delete', confirmDelete.ids);
        }}
        title={confirmDelete?.title || '删除钩子'}
        message={confirmDelete?.message || ''}
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  bg,
  border,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`p-5 rounded-2xl ${bg} border ${border} flex flex-col items-center text-center transition-transform hover:scale-105 duration-300`}>
      <div className={`${color} mb-2 opacity-80`}>{icon}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function HookCard({
  hook,
  selected,
  overdueWarning,
  onSelect,
  onResolve,
  onAbandon,
  onReference,
  onEdit,
  onDelete,
}: {
  hook: NarrativeHook;
  selected: boolean;
  overdueWarning?: OverdueHookWarningRecord;
  onSelect: (checked: boolean) => void;
  onResolve: () => void;
  onAbandon: () => void;
  onReference: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeConfig = HOOK_TYPES.find((item) => item.id === hook.type) || HOOK_TYPES[0];
  const importanceConfig = IMPORTANCE_LEVELS.find((item) => item.id === hook.importance) || IMPORTANCE_LEVELS[2];

  const statusColors: Record<HookStatus, string> = {
    planted: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    referenced: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    abandoned: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  };

  const statusLabels: Record<HookStatus, string> = {
    planted: '已埋设',
    referenced: '已引用',
    resolved: '已解决',
    abandoned: '已放弃',
  };

  const isActive = hook.status === 'planted' || hook.status === 'referenced';

  return (
    <GlassCard
      variant="interactive"
      padding="lg"
      hover={true}
      className="relative group overflow-hidden border-l-4"
      style={{
        borderLeftColor:
          importanceConfig.id === 'critical'
            ? '#ef4444'
            : importanceConfig.id === 'major'
              ? '#f97316'
              : '#60a5fa',
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <label className="inline-flex items-center gap-2 mt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="h-4 w-4 rounded border border-white/20 bg-transparent accent-emerald-500"
          />
          <span className="text-xs text-zinc-400">选择</span>
        </label>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${importanceConfig.bg} ${importanceConfig.color}`}>
                {importanceConfig.label}
              </span>
              <span className="text-xs text-gray-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 flex items-center gap-1.5">
                <span>{typeConfig.icon}</span>
                {typeConfig.label}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${statusColors[hook.status]}`}>
                {statusLabels[hook.status]}
              </span>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/[0.03] px-0 text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/12 hover:border-emerald-500/30"
                title="编辑钩子"
                aria-label="编辑钩子"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h2m2 14H9a2 2 0 01-2-2V9a2 2 0 012-2h4.5M14 4l6 6m-6-6L7 11v3h3l7-7" />
                </svg>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/[0.03] px-0 text-gray-500 hover:text-red-400 hover:bg-red-500/12 hover:border-red-500/30"
                title="删除钩子"
                aria-label="删除钩子"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </div>
          </div>

          <div>
            <p className="text-white font-medium text-lg leading-relaxed">{hook.description}</p>
            {hook.notes && <p className="text-gray-400 text-sm mt-2 italic">{hook.notes}</p>}
            {overdueWarning && (
              <div className="mt-3 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
                已超期 {overdueWarning.chaptersOverdue} 章：{overdueWarning.suggestedAction}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {hook.relatedCharacters.map((character, index) => (
              <span
                key={`${character}-${index}`}
                className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded-md flex items-center gap-1"
              >
                <span>👤</span>
                {character}
              </span>
            ))}
            {hook.expectedResolutionBy && (
              <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-1 rounded-md">
                预期回收：第 {hook.expectedResolutionBy} 章
              </span>
            )}
            <span className="text-xs bg-white/5 text-zinc-300 border border-white/10 px-2 py-1 rounded-md">
              提醒阈值：{hook.reminderThreshold || 10} 章
            </span>
          </div>
        </div>

        <div className="md:w-64 shrink-0 bg-white/5 rounded-xl p-4 border border-white/5 flex flex-col justify-center">
          <div className="relative pl-4 border-l-2 border-gray-700 space-y-6">
            <div className="relative">
              <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#0f172a]" />
              <p className="text-xs text-blue-400 font-medium">埋设于</p>
              <p className="text-sm text-white font-bold">第 {hook.plantedInChapter} 章</p>
            </div>

            {hook.referencedInChapters.length > 0 && (
              <div className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-purple-500 border-2 border-[#0f172a]" />
                <p className="text-xs text-purple-400 font-medium">引用章节</p>
                <p className="text-sm text-white">第 {hook.referencedInChapters.join(', ')} 章</p>
              </div>
            )}

            {hook.resolvedInChapter ? (
              <div className="relative">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0f172a]" />
                <p className="text-xs text-emerald-400 font-medium">解决于</p>
                <p className="text-sm text-white font-bold">第 {hook.resolvedInChapter} 章</p>
              </div>
            ) : (
              <div className="relative opacity-60">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-gray-700 border-2 border-[#0f172a]" />
                <p className="text-xs text-gray-500 font-medium">回收状态</p>
                <p className="text-sm text-gray-400">待推进</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isActive && (
        <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReference}
            className="flex-1 border border-purple-500/25 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/35"
          >
            <span>🔗</span>
            记录引用
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onResolve}
            className="flex-1 border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/35"
          >
            <span>✅</span>
            标记解决
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAbandon}
            className="flex-1 border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30"
          >
            <span>🗑️</span>
            放弃钩子
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

function HookEditorModal({
  isOpen,
  hook,
  isSaving,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  hook: NarrativeHook | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: HookFormPayload) => Promise<void>;
}) {
  const [type, setType] = useState<HookType>('foreshadowing');
  const [description, setDescription] = useState('');
  const [plantedInChapter, setPlantedInChapter] = useState(1);
  const [importance, setImportance] = useState<HookImportance>('minor');
  const [plantedContext, setPlantedContext] = useState('');
  const [expectedResolutionBy, setExpectedResolutionBy] = useState('');
  const [reminderThreshold, setReminderThreshold] = useState('10');
  const [relatedCharacters, setRelatedCharacters] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (hook) {
      setType(hook.type);
      setDescription(hook.description || '');
      setPlantedInChapter(hook.plantedInChapter || 1);
      setImportance(hook.importance || 'minor');
      setPlantedContext(hook.plantedContext || '');
      setExpectedResolutionBy(hook.expectedResolutionBy ? String(hook.expectedResolutionBy) : '');
      setReminderThreshold(String(hook.reminderThreshold || 10));
      setRelatedCharacters((hook.relatedCharacters || []).join(', '));
      setNotes(hook.notes || '');
      return;
    }

    setType('foreshadowing');
    setDescription('');
    setPlantedInChapter(1);
    setImportance('minor');
    setPlantedContext('');
    setExpectedResolutionBy('');
    setReminderThreshold('10');
    setRelatedCharacters('');
    setNotes('');
  }, [hook, isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) return;

    const expectedValue = expectedResolutionBy.trim();
    const reminderValue = Number.parseInt(reminderThreshold, 10);
    const characters = relatedCharacters
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);

    await onSave({
      type,
      description: description.trim(),
      plantedInChapter: Math.max(1, plantedInChapter),
      plantedContext: plantedContext.trim() || undefined,
      importance,
      expectedResolutionBy: expectedValue ? Math.max(1, Number.parseInt(expectedValue, 10) || 1) : undefined,
      reminderThreshold: Number.isFinite(reminderValue) && reminderValue > 0 ? reminderValue : 10,
      relatedCharacters: characters,
      relatedOrganizations: [],
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={hook ? '编辑叙事钩子' : '添加叙事钩子'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">类型</label>
            <div className="grid grid-cols-2 gap-2">
              {HOOK_TYPES.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setType(item.id)}
                  className={`h-auto justify-start rounded-xl border p-2 text-xs transition-all ${
                    type === item.id
                      ? 'border-emerald-500 bg-emerald-500/20 text-white'
                      : 'border-transparent bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">重要性</label>
            <div className="grid grid-cols-3 gap-2">
              {IMPORTANCE_LEVELS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setImportance(item.id)}
                  className={`h-auto flex-col rounded-xl border p-2 text-xs transition-all ${
                    importance === item.id
                      ? `${item.bg} border-current ${item.color}`
                      : 'border-transparent bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span className="font-bold">{item.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="glass-input w-full px-4 py-3 rounded-xl min-h-[96px] resize-none focus:border-emerald-500/50"
            placeholder="描述这个钩子的内容..."
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">埋设章节</label>
            <input
              type="number"
              min="1"
              value={plantedInChapter}
              onChange={(e) => setPlantedInChapter(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              className="glass-input w-full px-4 py-3 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">预期回收章节</label>
            <input
              type="number"
              min="1"
              value={expectedResolutionBy}
              onChange={(e) => setExpectedResolutionBy(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
              placeholder="可留空"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">提醒阈值(章)</label>
            <input
              type="number"
              min="1"
              value={reminderThreshold}
              onChange={(e) => setReminderThreshold(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">关联角色</label>
            <input
              type="text"
              value={relatedCharacters}
              onChange={(e) => setRelatedCharacters(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
              placeholder="逗号分隔"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">埋设上下文（可选）</label>
            <textarea
              value={plantedContext}
              onChange={(e) => setPlantedContext(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl min-h-[90px] resize-none"
              placeholder="埋设时的场景或对白..."
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">备注（可选）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl min-h-[90px] resize-none"
              placeholder="补充管理备注..."
            />
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" size="sm" className="px-6" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isSaving} className="px-6">
            {hook ? '保存修改' : '创建钩子'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function ActionModal({
  hook,
  action,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  hook: NarrativeHook;
  action: HookAction;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [chapterNumber, setChapterNumber] = useState(Math.max(1, hook.plantedInChapter + 1));
  const [context, setContext] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setChapterNumber(Math.max(1, hook.plantedInChapter + 1));
    setContext('');
    setReason('');
  }, [hook, action]);

  const titles: Record<HookAction, { text: string; icon: string }> = {
    resolve: { text: '解决钩子', icon: '✅' },
    abandon: { text: '放弃钩子', icon: '🗑️' },
    reference: { text: '引用钩子', icon: '🔗' },
  };

  const handleConfirm = async () => {
    if (action === 'abandon') {
      await onConfirm({ reason });
      return;
    }

    await onConfirm({ chapterNumber, context });
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${titles[action].icon} ${titles[action].text}`} size="md">
      <div className="space-y-4">
        <div className="bg-white/5 p-4 rounded-xl border border-white/10">
          <p className="text-gray-400 text-sm line-clamp-3">{hook.description}</p>
        </div>

        {action !== 'abandon' && (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">章节号</label>
              <input
                type="number"
                min="1"
                value={chapterNumber}
                onChange={(e) => setChapterNumber(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                className="glass-input w-full px-4 py-3 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">上下文（可选）</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl min-h-[80px] resize-none"
                placeholder={action === 'resolve' ? '如何解决的...' : '引用发生在什么场景...'}
              />
            </div>
          </>
        )}

        {action === 'abandon' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">放弃原因（可选）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl min-h-[80px] resize-none"
              placeholder="为什么放弃这个钩子..."
            />
          </div>
        )}

        <ModalFooter>
          <Button variant="secondary" size="sm" className="px-6" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="sm" className="px-6" onClick={handleConfirm} isLoading={isSubmitting}>
            确认
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function BatchActionModal({
  action,
  selectedCount,
  defaultChapter,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  action: Exclude<BatchAction, 'delete'>;
  selectedCount: number;
  defaultChapter: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [chapterNumber, setChapterNumber] = useState(Math.max(1, defaultChapter));
  const [context, setContext] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setChapterNumber(Math.max(1, defaultChapter));
    setContext('');
    setReason('');
  }, [action, defaultChapter]);

  const meta: Record<Exclude<BatchAction, 'delete'>, { title: string; icon: string }> = {
    reference: { title: '批量记录引用', icon: '🔗' },
    resolve: { title: '批量标记解决', icon: '✅' },
    abandon: { title: '批量放弃', icon: '🗑️' },
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${meta[action].icon} ${meta[action].title}`} size="md">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
          将对 <span className="text-white font-semibold">{selectedCount}</span> 个钩子执行操作。
        </div>

        {action !== 'abandon' && (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">章节号</label>
              <input
                type="number"
                min="1"
                value={chapterNumber}
                onChange={(e) => setChapterNumber(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                className="glass-input w-full px-4 py-3 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">上下文（可选）</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl min-h-[84px] resize-none"
                placeholder={action === 'resolve' ? '统一解决说明...' : '统一引用说明...'}
              />
            </div>
          </>
        )}

        {action === 'abandon' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">放弃原因（可选）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl min-h-[84px] resize-none"
              placeholder="批量放弃原因..."
            />
          </div>
        )}

        <ModalFooter>
          <Button variant="secondary" size="sm" className="px-6" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="px-6"
            isLoading={isSubmitting}
            onClick={async () => {
              if (action === 'abandon') {
                await onConfirm({ reason });
                return;
              }
              await onConfirm({ chapterNumber, context });
            }}
          >
            确认执行
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

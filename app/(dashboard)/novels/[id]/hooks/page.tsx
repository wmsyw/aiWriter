'use client';

import { useState, useMemo, use } from 'react';
import Link from 'next/link';
import GlassCard from '@/app/components/ui/GlassCard';
import Modal from '@/app/components/ui/Modal';
import HookTimeline from '@/app/components/HookTimeline';
import { useFetch } from '@/src/hooks/useFetch';

type HookStatus = 'planted' | 'referenced' | 'resolved' | 'abandoned';
type HookType = 'foreshadowing' | 'chekhov_gun' | 'mystery' | 'promise' | 'setup';
type HookImportance = 'critical' | 'major' | 'minor';

interface NarrativeHook {
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

export default function HooksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: novelId } = use(params);
  
  const { data: hooks, isLoading, refetch } = useFetch<NarrativeHook[]>(
    `/api/novels/${novelId}/hooks`,
    { initialData: [] }
  );
  
  const { data: reportData } = useFetch<{ report: HooksReport }>(
    `/api/novels/${novelId}/hooks/report`
  );
  
  const [activeTab, setActiveTab] = useState<HookStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<NarrativeHook | null>(null);
  const [actionModal, setActionModal] = useState<{ hook: NarrativeHook; action: 'resolve' | 'abandon' | 'reference' } | null>(null);

  const hooksList = Array.isArray(hooks) ? hooks : [];
  const report = reportData?.report;

  const filteredHooks = useMemo(() => {
    return hooksList.filter(hook => {
      const matchesTab = activeTab === 'all' || hook.status === activeTab;
      const matchesSearch = (hook.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [hooksList, activeTab, searchQuery]);

  const handleCreate = async (data: Partial<NarrativeHook>) => {
    try {
      const res = await fetch(`/api/novels/${novelId}/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        refetch();
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to create hook:', error);
    }
  };

  const handleAction = async (hookId: string, action: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/novels/${novelId}/hooks/${hookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      });
      if (res.ok) {
        refetch();
        setActionModal(null);
      }
    } catch (error) {
      console.error('Failed to update hook:', error);
    }
  };

  const handleDelete = async (hookId: string) => {
    if (!confirm('确定要删除这个钩子吗？')) return;
    try {
      const res = await fetch(`/api/novels/${novelId}/hooks/${hookId}`, { method: 'DELETE' });
      if (res.ok) refetch();
    } catch (error) {
      console.error('Failed to delete hook:', error);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in min-h-screen">
      <div className="flex flex-col gap-6">
        <Link 
          href={`/novels/${novelId}`}
          className="text-gray-400 hover:text-white flex items-center gap-2 w-fit transition-colors group text-sm font-medium"
        >
          <span className="bg-white/5 p-1.5 rounded-lg group-hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <p className="text-gray-400 max-w-xl">追踪故事中的伏笔、悬念和承诺，确保每一个埋设的钩子都能得到完美的回收。</p>
          </div>
          <button 
            onClick={(e) => { 
              e.preventDefault();
              setEditingHook(null); 
              setIsModalOpen(true); 
            }}
            className="btn-primary px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all transform hover:-translate-y-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加新钩子
          </button>
        </div>
      </div>

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-red-400 font-bold">关键钩子未解决</h3>
            <p className="text-red-300/70 text-sm">
              有 <strong>{report.unresolvedByImportance.critical}</strong> 个关键剧情钩子尚未解决，请优先处理以保证故事完整性。
            </p>
          </div>
        </div>
      )}

      <HookTimeline hooks={hooksList} />

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/5 p-2 rounded-2xl border border-white/5 backdrop-blur-sm sticky dashboard-sticky-offset z-20 shadow-xl shadow-black/20">
        <div className="flex overflow-x-auto pb-2 md:pb-0 gap-1 no-scrollbar w-full md:w-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="relative w-full md:w-72 group">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索钩子描述、类型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-48 rounded-2xl animate-pulse bg-white/5" />
          ))}
        </div>
      ) : filteredHooks.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {filteredHooks.map((hook) => (
            <HookCard 
              key={hook.id} 
              hook={hook}
              onResolve={() => setActionModal({ hook, action: 'resolve' })}
              onAbandon={() => setActionModal({ hook, action: 'abandon' })}
              onReference={() => setActionModal({ hook, action: 'reference' })}
              onDelete={() => handleDelete(hook.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 opacity-50 flex flex-col items-center">
          <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <p className="text-xl font-bold text-gray-300">暂无钩子</p>
          <p className="text-gray-500 mt-2 max-w-sm">没有找到符合条件的叙事钩子。尝试调整筛选条件或创建新的钩子。</p>
        </div>
      )}

      {isModalOpen && (
        <CreateHookModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleCreate}
        />
      )}

      {actionModal && (
        <ActionModal
          hook={actionModal.hook}
          action={actionModal.action}
          onClose={() => setActionModal(null)}
          onConfirm={(data) => handleAction(actionModal.hook.id, actionModal.action, data)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg, border, icon }: { label: string; value: string | number; color: string; bg: string; border: string; icon: React.ReactNode }) {
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
  onResolve, 
  onAbandon, 
  onReference,
  onDelete 
}: { 
  hook: NarrativeHook; 
  onResolve: () => void;
  onAbandon: () => void;
  onReference: () => void;
  onDelete: () => void;
}) {
  const typeConfig = HOOK_TYPES.find(t => t.id === hook.type) || HOOK_TYPES[0];
  const importanceConfig = IMPORTANCE_LEVELS.find(i => i.id === hook.importance) || IMPORTANCE_LEVELS[2];
  
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
    <GlassCard variant="interactive" padding="lg" hover={true} className="relative group overflow-hidden border-l-4" style={{ borderLeftColor: importanceConfig.id === 'critical' ? '#ef4444' : importanceConfig.id === 'major' ? '#f97316' : '#60a5fa' }}>
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
            
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
              title="删除钩子"
              aria-label="删除钩子"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          <div>
            <p className="text-white font-medium text-lg leading-relaxed">{hook.description}</p>
            {hook.notes && <p className="text-gray-400 text-sm mt-2 italic">{hook.notes}</p>}
          </div>
          
          <div className="flex flex-wrap gap-2">
            {hook.relatedCharacters.map((char, i) => (
              <span key={i} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded-md flex items-center gap-1">
                <span>👤</span> {char}
              </span>
            ))}
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
                <p className="text-xs text-purple-400 font-medium">引用</p>
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
              <div className="relative opacity-50">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-gray-700 border-2 border-[#0f172a]" />
                <p className="text-xs text-gray-500 font-medium">预期解决</p>
                <p className="text-sm text-gray-400">待定...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isActive && (
        <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-4">
          <button
            onClick={onReference}
            className="flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all hover:scale-[1.02]"
          >
            <span>🔗</span> 记录引用
          </button>
          <button
            onClick={onResolve}
            className="flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all hover:scale-[1.02]"
          >
            <span>✅</span> 标记解决
          </button>
          <button
            onClick={onAbandon}
            className="flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-xl bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-all hover:scale-[1.02]"
          >
            <span>🗑️</span> 放弃钩子
          </button>
        </div>
      )}
    </GlassCard>
  );
}

function CreateHookModal({ 
  isOpen, 
  onClose, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: Partial<NarrativeHook>) => Promise<void>;
}) {
  const [type, setType] = useState<HookType>('foreshadowing');
  const [description, setDescription] = useState('');
  const [plantedInChapter, setPlantedInChapter] = useState(1);
  const [importance, setImportance] = useState<HookImportance>('minor');
  const [plantedContext, setPlantedContext] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    
    setIsSaving(true);
    await onSave({
      type,
      description,
      plantedInChapter,
      importance,
      plantedContext: plantedContext || undefined,
    });
    setIsSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="添加叙事钩子" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">类型</label>
            <div className="grid grid-cols-2 gap-2">
              {HOOK_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`p-2 rounded-xl text-xs flex items-center gap-2 border transition-all ${
                    type === t.id 
                      ? 'bg-emerald-500/20 border-emerald-500 text-white' 
                      : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">重要性</label>
            <div className="grid grid-cols-3 gap-2">
              {IMPORTANCE_LEVELS.map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setImportance(i.id)}
                  className={`p-2 rounded-xl text-xs flex flex-col items-center justify-center border transition-all ${
                    importance === i.id 
                      ? `${i.bg} border-current ${i.color}` 
                      : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <span className="font-bold">{i.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="glass-input w-full px-4 py-3 rounded-xl min-h-[100px] resize-none focus:border-emerald-500/50 transition-colors"
            placeholder="描述这个钩子的内容..."
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">埋设章节</label>
            <input
              type="number"
              min="1"
              value={plantedInChapter}
              onChange={(e) => setPlantedInChapter(parseInt(e.target.value) || 1)}
              className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">上下文 (可选)</label>
            <input
              type="text"
              value={plantedContext}
              onChange={(e) => setPlantedContext(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl focus:border-emerald-500/50 transition-colors"
              placeholder="埋设时的场景或对话..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-6 py-2.5 rounded-xl text-sm"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/20"
          >
            {isSaving ? '保存中...' : '创建钩子'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActionModal({ 
  hook, 
  action, 
  onClose, 
  onConfirm 
}: { 
  hook: NarrativeHook;
  action: 'resolve' | 'abandon' | 'reference';
  onClose: () => void;
  onConfirm: (data: Record<string, unknown>) => void;
}) {
  const [chapterNumber, setChapterNumber] = useState(hook.plantedInChapter + 1);
  const [context, setContext] = useState('');
  const [reason, setReason] = useState('');

  const titles: Record<string, { text: string; icon: string }> = {
    resolve: { text: '解决钩子', icon: '✅' },
    abandon: { text: '放弃钩子', icon: '🗑️' },
    reference: { text: '引用钩子', icon: '🔗' },
  };

  const handleConfirm = () => {
    if (action === 'abandon') {
      onConfirm({ reason });
    } else {
      onConfirm({ chapterNumber, context });
    }
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
                onChange={(e) => setChapterNumber(parseInt(e.target.value) || 1)}
                className="glass-input w-full px-4 py-3 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">上下文 (可选)</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl min-h-[80px] resize-none"
                placeholder={action === 'resolve' ? '如何解决的...' : '引用的场景...'}
              />
            </div>
          </>
        )}
        
        {action === 'abandon' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">放弃原因 (可选)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl min-h-[80px] resize-none"
              placeholder="为什么放弃这个钩子..."
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button onClick={onClose} className="btn-secondary px-6 py-2.5 rounded-xl text-sm">
            取消
          </button>
          <button onClick={handleConfirm} className="btn-primary px-6 py-2.5 rounded-xl text-sm shadow-lg">
            确认
          </button>
        </div>
      </div>
    </Modal>
  );
}

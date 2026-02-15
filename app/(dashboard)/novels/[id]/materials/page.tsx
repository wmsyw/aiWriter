'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MaterialSearchModal from './MaterialSearchModal';
import Modal, { ConfirmModal, ModalFooter } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { InlineInput } from '@/app/components/ui/InlineInput';
import { SearchInput } from '@/app/components/ui/SearchInput';
import { useToast } from '@/app/components/ui/Toast';
import GlassCard from '@/app/components/ui/GlassCard';
import { useFetch } from '@/src/hooks/useFetch';
import { pollJobUntilTerminal } from '@/app/lib/jobs/polling';
import { parseJobResponse } from '@/src/shared/jobs';
import {
  buildMaterialsStats,
  filterMaterials,
  getMaterialExcerpt,
  getMaterialTypeLabel,
  type MaterialType,
} from '@/src/shared/materials';

interface Material {
  id: string;
  type: MaterialType;
  name: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function toStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(value);
  if (!record) return {};

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, String(entry ?? '')])
  );
}

const TABS: { id: MaterialType | 'all'; label: string }[] = [
  { id: 'all', label: '全部素材' },
  { id: 'character', label: '角色' },
  { id: 'location', label: '地点' },
  { id: 'organization', label: '组织' },
  { id: 'item', label: '道具' },
  { id: 'plotPoint', label: '情节点' },
  { id: 'worldbuilding', label: '世界观' },
  { id: 'custom', label: '自定义' },
];

export default function MaterialsPage() {
  const params = useParams();
  const novelId = params.id as string;
  
  const { data: materials, isLoading, refetch } = useFetch<Material[]>(
    novelId ? `/api/novels/${novelId}/materials` : null,
    { initialData: [] }
  );
  
  const [activeTab, setActiveTab] = useState<MaterialType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const [activeSearch, setActiveSearch] = useState<{ jobId: string; keyword: string } | null>(null);
  const { toast } = useToast();
  const [isDeduplicating, setIsDeduplicating] = useState(false);
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

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredMaterials.map(m => m.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleDeduplicate = async () => {
    const ids = selectedIds.size > 0 
      ? Array.from(selectedIds) 
      : filteredMaterials.map(m => m.id);
      
    const count = ids.length;
    
    if (count < 2) {
      toast({ variant: 'info', description: '当前列表素材不足2个，无需去重' });
      return;
    }

    setConfirmState({
      isOpen: true,
      title: '确认智能去重',
      message: `确定要使用AI自动分析并合并这 ${count} 个素材吗？\n这将保留信息最全的版本并删除重复项。`,
      confirmText: '开始去重',
      variant: 'info',
      onConfirm: async () => {
        setIsDeduplicating(true);
        try {
          const res = await fetch(`/api/novels/${novelId}/materials/deduplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          
          if (res.ok) {
            const payload = await res.json();
            const job = parseJobResponse(payload);
            if (!job) {
              throw new Error('任务创建失败：返回数据异常');
            }
            setActiveSearch({ jobId: job.id, keyword: '智能去重' });
            toast({ variant: 'info', description: 'AI去重任务已开始...' });
            clearSelection();
          } else {
            throw new Error('Failed to start deduplication');
          }
        } catch (error) {
          console.error('Deduplicate failed:', error);
          toast({ variant: 'error', description: '启动去重失败' });
        }
      }
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    setConfirmState({
      isOpen: true,
      title: '确认批量删除',
      message: `确定要删除 ${selectedIds.size} 个素材吗？此操作不可撤销。`,
      confirmText: '确认删除',
      variant: 'danger',
      onConfirm: async () => {
        const deleteCount = selectedIds.size;
        try {
          const res = await fetch(`/api/novels/${novelId}/materials/batch`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: Array.from(selectedIds) }),
          });
          
          if (!res.ok) {
            throw new Error(`Error: ${res.status}`);
          }
          
          clearSelection();
          refetch();
          toast({ variant: 'success', description: `已删除 ${deleteCount} 个素材` });
        } catch (error) {
          console.error('Batch delete failed:', error);
          toast({ variant: 'error', description: '批量删除失败' });
        }
      }
    });
  };

  useEffect(() => {
    if (!activeSearch) return;

    const controller = new AbortController();

    void (async () => {
      try {
        await pollJobUntilTerminal(activeSearch.jobId, {
          intervalMs: 2000,
          maxAttempts: 300,
          signal: controller.signal,
          timeoutMessage: '任务超时，请稍后重试',
          failedMessage: `"${activeSearch.keyword}" 任务失败`,
        });
        if (controller.signal.aborted) return;

        setActiveSearch(null);
        toast({ variant: 'success', description: `"${activeSearch.keyword}" 任务完成` });
        refetch();
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Poll failed:', error);
        setActiveSearch(null);
        toast({
          variant: 'error',
          description: error instanceof Error ? error.message : `"${activeSearch.keyword}" 任务失败`,
        });
      }
    })();

    return () => controller.abort();
  }, [activeSearch, refetch]);

  const materialsList = Array.isArray(materials) ? materials : [];

  const filteredMaterials = useMemo(() => {
    return filterMaterials(materialsList, {
      activeTab,
      searchQuery,
    });
  }, [materialsList, activeTab, searchQuery]);

  const materialsStats = useMemo(
    () => buildMaterialsStats(materialsList, filteredMaterials, selectedIds.size),
    [materialsList, filteredMaterials, selectedIds.size]
  );

  const handleOpenCreate = () => {
    setEditingMaterial(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (material: Material) => {
    setEditingMaterial(material);
    setIsModalOpen(true);
  };

  const handleSave = async (materialData: { type: MaterialType; name: string; data: any }) => {
    try {
      const url = editingMaterial 
        ? `/api/novels/${novelId}/materials/${editingMaterial.id}`
        : `/api/novels/${novelId}/materials`;
        
      const method = editingMaterial ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(materialData),
      });

      if (res.ok) {
        refetch();
        setIsModalOpen(false);
      } else {
        toast({ variant: 'error', description: '保存失败，请重试' });
      }
    } catch (error) {
      console.error('Save failed:', error);
      toast({ variant: 'error', description: '保存失败' });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link 
              href={`/novels/${novelId}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="返回小说详情"
              aria-label="返回小说详情"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-gradient">素材库</h1>
          </div>
          <p className="text-gray-400 pl-1">管理你的故事元素、角色和世界观设定</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className="min-w-[96px]"
          >
            {isSelectionMode ? '取消选择' : '批量管理'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDeduplicate}
            isLoading={isDeduplicating}
            loadingText="去重中..."
            className="min-w-[116px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            AI 汇总去重
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => { e.preventDefault(); setIsSearchModalOpen(true); }}
            className="min-w-[112px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            AI 联网搜索
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => { e.preventDefault(); handleOpenCreate(); }}
            className="min-w-[96px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加素材
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#111722]/84 p-2 rounded-2xl border border-white/12 backdrop-blur-md">
        <div className="flex overflow-x-auto pb-2 md:pb-0 gap-1 no-scrollbar w-full md:w-auto">
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={`h-9 rounded-xl px-4 text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border border-emerald-400/45 bg-emerald-500/20 !text-white font-semibold tracking-[0.01em] [text-shadow:0_1px_1px_rgba(0,0,0,0.45)] shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_12px_24px_-14px_rgba(16,185,129,0.85)] hover:bg-emerald-500/26' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        
        <div className="w-full md:w-64">
          <SearchInput
            placeholder="搜索素材..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            className="h-10 text-sm"
            aria-label="搜索素材"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">素材总数</div>
          <div className="mt-1 text-xl font-semibold text-white">{materialsStats.total}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">筛选命中</div>
          <div className="mt-1 text-xl font-semibold text-emerald-300">{materialsStats.filtered}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">当前类型数</div>
          <div className="mt-1 text-xl font-semibold text-sky-300">{materialsStats.activeTypeCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">已选素材</div>
          <div className="mt-1 text-xl font-semibold text-amber-300">{materialsStats.selected}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card h-48 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredMaterials.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMaterials.map((material) => (
            <MaterialCard 
              key={material.id} 
              material={material} 
              onClick={() => handleOpenEdit(material)}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(material.id)}
              onToggle={() => toggleSelection(material.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 opacity-50">
          <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-xl font-medium text-gray-300">暂无素材</p>
          <p className="text-sm text-gray-500 mt-1">创建你的第一个{activeTab !== 'all' ? TABS.find(t => t.id === activeTab)?.label : '素材'}开始吧</p>
        </div>
      )}

      {isModalOpen && (
        <MaterialModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          initialData={editingMaterial}
          defaultType={activeTab === 'all' ? 'character' : activeTab}
          novelId={novelId}
        />
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
      />

      <MaterialSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        novelId={novelId}
        onComplete={() => {
          refetch();
          setIsSearchModalOpen(false);
        }}
        onSearchStarted={(jobId, keyword) => {
          setActiveSearch({ jobId, keyword });
          toast({ variant: 'info', description: `已开始搜索 "${keyword}"` });
        }}
      />

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-card px-6 py-3 rounded-2xl flex items-center gap-4 shadow-2xl border border-white/10 animate-slide-up">
          <span className="text-sm text-gray-300">已选择 {selectedIds.size} 项</span>
          <Button variant="ghost" size="sm" className="h-8 px-3 border border-white/10 bg-white/[0.03] text-emerald-300 hover:bg-white/10" onClick={selectAll}>全选</Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10" onClick={clearSelection}>取消</Button>
          <Button variant="primary" size="sm" className="h-8 px-4" onClick={handleBatchDelete}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </Button>
        </div>
      )}

      {activeSearch && (
        <div className="fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl bg-blue-600 flex items-center gap-3 animate-slide-up">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-white font-medium">正在搜索 "{activeSearch.keyword}"...</span>
        </div>
      )}
    </div>
  );
}

function MaterialCard({ 
  material, 
  onClick, 
  isSelectionMode,
  isSelected,
  onToggle 
}: { 
  material: Material; 
  onClick: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const getIcon = (type: MaterialType) => {
    switch (type) {
      case 'character': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
      case 'location': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
      case 'organization': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
      case 'item': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
      case 'plotPoint': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
      case 'worldbuilding': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      default: return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    }
  };

  return (
    <GlassCard 
      variant="interactive"
      padding="md"
      hover={true}
      onClick={isSelectionMode ? onToggle : onClick}
      className={`relative overflow-hidden ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2.5 rounded-xl bg-white/5 transition-all duration-300 ${isSelectionMode ? '' : 'text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/10'}`}>
            {isSelectionMode ? (
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-500 bg-black/20'
              }`}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            ) : (
              getIcon(material.type)
            )}
          </div>
          <span className="text-xs font-medium text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
            {getMaterialTypeLabel(material.type)}
          </span>
        </div>
        
        <h3 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
          {material.name}
        </h3>
        
        <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">
          {getMaterialExcerpt(material.data)}
        </p>
      </div>
    </GlassCard>
  );
}

function MaterialModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  defaultType,
  novelId
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: any) => Promise<void>; 
  initialData: Material | null;
  defaultType: MaterialType;
  novelId: string;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<MaterialType>(initialData?.type || defaultType);
  const [name, setName] = useState<string>(initialData?.name || '');
  const [description, setDescription] = useState<string>(
    typeof initialData?.data?.description === 'string' ? initialData.data.description : ''
  );
  const [attributes, setAttributes] = useState<Record<string, string>>(
    toStringRecord(initialData?.data?.attributes)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [enhancingJobId, setEnhancingJobId] = useState<string | null>(null);
  const [newAttrKey, setNewAttrKey] = useState('');
  const [isAddingAttr, setIsAddingAttr] = useState(false);

  useEffect(() => {
    if (!enhancingJobId) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const result = await pollJobUntilTerminal<Record<string, unknown>>(enhancingJobId, {
          intervalMs: 2000,
          maxAttempts: 300,
          signal: controller.signal,
          timeoutMessage: 'AI完善超时，请稍后重试',
          failedMessage: 'AI完善失败，请重试',
        });
        if (controller.signal.aborted) return;

        setEnhancingJobId(null);

        const output = toRecord(result);
        if (typeof output?.description === 'string') {
          setDescription(output.description);
        }

        const outputAttributes = toRecord(output?.attributes);
        if (outputAttributes) {
          setAttributes((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(outputAttributes).map(([key, value]) => [key, String(value ?? '')])
            ),
          }));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Poll enhance job failed:', error);
        setEnhancingJobId(null);
        toast({
          variant: 'error',
          description: error instanceof Error ? error.message : 'AI完善失败，请重试',
        });
      }
    })();

    return () => controller.abort();
  }, [enhancingJobId, toast]);

  const isEnhancing = enhancingJobId !== null;

  const handleAiEnhance = async () => {
    if (!name.trim()) {
      toast({ variant: 'error', description: '请先输入素材名称' });
      return;
    }
    
    try {
      const res = await fetch('/api/materials/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          materialName: name,
          materialType: type,
          currentDescription: description,
          currentAttributes: attributes,
        }),
      });
      
      if (res.ok) {
        const payload = await res.json();
        const job = parseJobResponse(payload);
        if (!job) {
          throw new Error('任务创建失败：返回数据异常');
        }
        setEnhancingJobId(job.id);
      }
    } catch (error) {
      console.error('Enhance failed:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSaving(true);
    await onSave({
      type,
      name,
      data: {
        description,
        attributes,
      }
    });
    setIsSaving(false);
  };

  const handleAttributeChange = (key: string, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const confirmAddAttribute = () => {
    if (newAttrKey.trim()) {
      if (attributes[newAttrKey.trim()] !== undefined) {
        toast({ variant: 'error', description: '该属性已存在' });
        return;
      }
      setAttributes(prev => ({ ...prev, [newAttrKey.trim()]: '' }));
      setNewAttrKey('');
      setIsAddingAttr(false);
    } else {
      setIsAddingAttr(false);
    }
  };

  const cancelAddAttribute = () => {
    setNewAttrKey('');
    setIsAddingAttr(false);
  };

  const removeAttribute = (key: string) => {
    const newAttrs = { ...attributes };
    delete newAttrs[key];
    setAttributes(newAttrs);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? '编辑素材' : '创建素材'}
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            type="text"
            label="名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-4 py-3 rounded-xl"
            placeholder="例如：张三、黑暗塔..."
            required
            showRequired
          />
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MaterialType)}
              className="select-menu w-full px-4 py-3 rounded-xl appearance-none"
            >
              {TABS.filter(t => t.id !== 'all').map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Textarea
          label="描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="px-4 py-3 rounded-xl min-h-[150px] resize-none"
          placeholder="详细描述..."
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-300">属性</label>
            {!isAddingAttr && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddingAttr(true)}
                className="h-7 px-3 border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加属性
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(attributes).map(([key, value]) => (
              <div key={key} className="glass-input p-3 rounded-xl relative group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-emerald-400 uppercase">{key}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAttribute(key)}
                    className="h-7 w-7 rounded-lg border border-transparent bg-transparent px-0 text-gray-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label={`删除属性 ${key}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
                <InlineInput
                  type="text"
                  value={value}
                  onChange={(e) => handleAttributeChange(key, e.target.value)}
                  className="placeholder-gray-600"
                  placeholder="输入值..."
                  aria-label={`属性 ${key} 的值`}
                />
              </div>
            ))}
            
            {isAddingAttr && (
              <div className="glass-input p-3 rounded-xl border border-emerald-500/50 ring-1 ring-emerald-500/20 animate-pulse-once">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-emerald-400">新属性名称</span>
                </div>
                <div className="flex gap-2">
                  <InlineInput
                    type="text"
                    value={newAttrKey}
                    onChange={(e) => setNewAttrKey(e.target.value)}
                    className="placeholder-gray-500"
                    placeholder="例如：年龄、等级..."
                    aria-label="新属性名称"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmAddAttribute();
                      } else if (e.key === 'Escape') {
                        cancelAddAttribute();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={confirmAddAttribute}
                    className="h-7 w-7 rounded-lg border border-transparent px-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    aria-label="确认新增属性"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelAddAttribute}
                    className="h-7 w-7 rounded-lg border border-transparent px-0 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                    aria-label="取消新增属性"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              </div>
            )}

            {!isAddingAttr && Object.keys(attributes).length === 0 && (
              <div 
                onClick={() => setIsAddingAttr(true)}
                className="col-span-full text-center py-6 border border-dashed border-white/10 rounded-xl text-gray-500 text-sm cursor-pointer hover:border-emerald-500/30 hover:bg-white/5 transition-all group"
              >
                <div className="mb-2 group-hover:text-emerald-400 transition-colors">
                  <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                暂无属性。点击添加自定义字段。
              </div>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" size="sm" className="px-6" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAiEnhance}
            disabled={isEnhancing || !name.trim()}
            isLoading={isEnhancing}
            loadingText="AI 完善中..."
            className="px-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI 完善
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSaving}
            isLoading={isSaving}
            loadingText="保存中..."
            className="px-6"
          >
            {initialData ? '更新素材' : '创建素材'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

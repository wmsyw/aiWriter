'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MaterialSearchModal from './MaterialSearchModal';
import Modal, { ConfirmModal } from '@/app/components/ui/Modal';
import GlassCard from '@/app/components/ui/GlassCard';
import { useFetch } from '@/src/hooks/useFetch';

type MaterialType = 'character' | 'location' | 'plotPoint' | 'worldbuilding' | 'organization' | 'item' | 'custom';

interface Material {
  id: string;
  type: MaterialType;
  name: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
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
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
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
      setToast({ message: '当前列表素材不足2个，无需去重', type: 'info' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (count < 2) {
      setToast({ message: '当前列表素材不足2个，无需去重', type: 'info' });
      setTimeout(() => setToast(null), 3000);
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
            const { job } = await res.json();
            setActiveSearch({ jobId: job.id, keyword: '智能去重' });
            setToast({ message: 'AI去重任务已开始...', type: 'info' });
            clearSelection();
          } else {
            throw new Error('Failed to start deduplication');
          }
        } catch (error) {
          console.error('Deduplicate failed:', error);
          setToast({ message: '启动去重失败', type: 'error' });
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
          setToast({ message: `已删除 ${deleteCount} 个素材`, type: 'success' });
          setTimeout(() => setToast(null), 3000);
        } catch (error) {
          console.error('Batch delete failed:', error);
          setToast({ message: '批量删除失败', type: 'error' });
          setTimeout(() => setToast(null), 3000);
        }
      }
    });
  };

  useEffect(() => {
    if (!activeSearch) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${activeSearch.jobId}`);
        if (res.ok) {
          const { job } = await res.json();
          if (job.status === 'succeeded') {
            clearInterval(pollInterval);
            setActiveSearch(null);
            setToast({ message: `"${activeSearch.keyword}" 任务完成`, type: 'success' });
            refetch();
            setTimeout(() => setToast(null), 4000);
          } else if (job.status === 'failed') {
            clearInterval(pollInterval);
            setActiveSearch(null);
            setToast({ message: `"${activeSearch.keyword}" 任务失败`, type: 'error' });
            setTimeout(() => setToast(null), 4000);
          }
        }
      } catch (error) {
        console.error('Poll failed:', error);
      }
    }, 2000);
    
    return () => clearInterval(pollInterval);
  }, [activeSearch, refetch]);

  const materialsList = Array.isArray(materials) ? materials : [];

  const filteredMaterials = useMemo(() => {
    return materialsList.filter(material => {
      const matchesTab = activeTab === 'all' || material.type === activeTab;
      const matchesSearch = (material.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [materialsList, activeTab, searchQuery]);

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
        setToast({ message: '保存失败，请重试', type: 'error' });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (error) {
      console.error('Save failed:', error);
      setToast({ message: '保存失败', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link 
              href={`/novels/${novelId}`}
              className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="返回小说详情"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-gradient">素材库</h1>
          </div>
          <p className="text-gray-400 pl-1">管理你的故事元素、角色和世界观设定</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className="btn-secondary px-5 py-2.5 rounded-xl flex items-center gap-2"
          >
            {isSelectionMode ? '取消选择' : '批量管理'}
          </button>
          <button 
            onClick={handleDeduplicate}
            disabled={isDeduplicating}
            className="btn-secondary px-5 py-2.5 rounded-xl flex items-center gap-2"
          >
            {isDeduplicating ? (
              <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            )}
            AI 汇总去重
          </button>
          <button 
            onClick={(e) => { e.preventDefault(); setIsSearchModalOpen(true); }}
            className="btn-secondary px-5 py-2.5 rounded-xl flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            AI 联网搜索
          </button>
          <button 
            onClick={(e) => { e.preventDefault(); handleOpenCreate(); }}
            className="btn-primary px-6 py-2.5 rounded-xl flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加素材
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/5 p-2 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex overflow-x-auto pb-2 md:pb-0 gap-1 no-scrollbar w-full md:w-auto">
          {TABS.map((tab) => (
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
        
        <div className="relative w-full md:w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索素材..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input w-full pl-10 pr-4 py-2 rounded-xl text-sm"
          />
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
          onToast={(msg, type) => {
            setToast({ message: msg, type });
            setTimeout(() => setToast(null), 3000);
          }}
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
          setToast({ message: `已开始搜索 "${keyword}"`, type: 'info' });
          setTimeout(() => setToast(null), 3000);
        }}
      />

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-card px-6 py-3 rounded-2xl flex items-center gap-4 shadow-2xl border border-white/10 animate-slide-up">
          <span className="text-sm text-gray-300">已选择 {selectedIds.size} 项</span>
          <button onClick={selectAll} className="text-sm text-emerald-400 hover:underline">全选</button>
          <button onClick={clearSelection} className="text-sm text-gray-400 hover:underline">取消</button>
          <button onClick={handleBatchDelete} className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </button>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-up ${
          toast.type === 'success' ? 'bg-emerald-600' : 
          toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.type === 'success' && (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'info' && (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span className="text-white font-medium">{toast.message}</span>
        </div>
      )}

      {activeSearch && !toast && (
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

  const getExcerpt = (data: Record<string, any>) => {
    const parts: string[] = [];
    if (typeof data.description === 'string' && data.description) {
      parts.push(data.description);
    }
    if (data.attributes && typeof data.attributes === 'object') {
      Object.values(data.attributes).forEach(v => {
        if (typeof v === 'string' && v) parts.push(v);
      });
    }
    const text = parts.join(' ');
    return text.length > 100 ? text.slice(0, 100) + '...' : text || '暂无详情';
  };

  const getTypeLabel = (type: MaterialType) => {
    const labels: Record<MaterialType, string> = {
      character: '角色',
      location: '地点',
      organization: '组织',
      item: '道具',
      plotPoint: '情节点',
      worldbuilding: '世界观',
      custom: '自定义',
    };
    return labels[type] || type;
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
            {getTypeLabel(material.type)}
          </span>
        </div>
        
        <h3 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
          {material.name}
        </h3>
        
        <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">
          {getExcerpt(material.data)}
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
  novelId,
  onToast
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: any) => Promise<void>; 
  initialData: Material | null;
  defaultType: MaterialType;
  novelId: string;
  onToast: (msg: string, type: 'info' | 'success' | 'error') => void;
}) {
  const [type, setType] = useState<MaterialType>(initialData?.type || defaultType);
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.data?.description || '');
  const [attributes, setAttributes] = useState<Record<string, string>>(initialData?.data?.attributes || {});
  const [isSaving, setIsSaving] = useState(false);
  const [enhancingJobId, setEnhancingJobId] = useState<string | null>(null);
  const [newAttrKey, setNewAttrKey] = useState('');
  const [isAddingAttr, setIsAddingAttr] = useState(false);

  useEffect(() => {
    if (!enhancingJobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const jobRes = await fetch(`/api/jobs/${enhancingJobId}`);
        if (cancelled) return;
        
        if (jobRes.ok) {
          const { job: jobStatus } = await jobRes.json();
          if (jobStatus.status === 'succeeded') {
            setEnhancingJobId(null);
            const result = jobStatus.output;
            if (result?.description) setDescription(result.description);
            if (result?.attributes) setAttributes(prev => ({ ...prev, ...result.attributes }));
          } else if (jobStatus.status === 'failed') {
            setEnhancingJobId(null);
            onToast('AI完善失败，请重试', 'error');
          } else if (!cancelled) {
            setTimeout(poll, 2000);
          }
        } else if (!cancelled) {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Poll enhance job failed:', error);
        if (!cancelled) setTimeout(poll, 2000);
      }
    };

    poll();

    return () => { cancelled = true; };
  }, [enhancingJobId, onToast]);

  const isEnhancing = enhancingJobId !== null;

  const handleAiEnhance = async () => {
    if (!name.trim()) {
      onToast('请先输入素材名称', 'error');
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
        const { job } = await res.json();
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
        onToast('该属性已存在', 'error');
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
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl"
              placeholder="例如：张三、黑暗塔..."
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MaterialType)}
              className="glass-input w-full px-4 py-3 rounded-xl appearance-none"
            >
              {TABS.filter(t => t.id !== 'all').map(t => (
                <option key={t.id} value={t.id} className="bg-[#1a1a2e]">{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="glass-input w-full px-4 py-3 rounded-xl min-h-[150px] resize-none"
            placeholder="详细描述..."
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-300">属性</label>
            {!isAddingAttr && (
              <button 
                type="button" 
                onClick={() => setIsAddingAttr(true)}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加属性
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(attributes).map(([key, value]) => (
              <div key={key} className="glass-input p-3 rounded-xl relative group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-emerald-400 uppercase">{key}</span>
                  <button 
                    type="button"
                    onClick={() => removeAttribute(key)}
                    className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleAttributeChange(key, e.target.value)}
                  className="bg-transparent w-full text-sm outline-none border-none p-0 focus:ring-0 text-white placeholder-gray-600"
                  placeholder="输入值..."
                />
              </div>
            ))}
            
            {isAddingAttr && (
              <div className="glass-input p-3 rounded-xl border border-emerald-500/50 ring-1 ring-emerald-500/20 animate-pulse-once">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-emerald-400">新属性名称</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAttrKey}
                    onChange={(e) => setNewAttrKey(e.target.value)}
                    className="bg-transparent w-full text-sm outline-none border-none p-0 focus:ring-0 text-white placeholder-gray-500"
                    placeholder="例如：年龄、等级..."
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
                  <button 
                    type="button"
                    onClick={confirmAddAttribute}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button 
                    type="button"
                    onClick={cancelAddAttribute}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
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

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-6 py-2.5 rounded-xl text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleAiEnhance}
            disabled={isEnhancing || !name.trim()}
            className="btn-secondary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isEnhancing ? (
              <>
                <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                AI 完善中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI 完善
              </>
            )}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2"
          >
            {isSaving ? '保存中...' : initialData ? '更新素材' : '创建素材'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

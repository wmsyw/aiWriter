'use client';

import { useState, useMemo, use } from 'react';
import Link from 'next/link';
import GlassCard from '@/app/components/ui/GlassCard';
import Modal from '@/app/components/ui/Modal';
import { useFetch } from '@/src/hooks/useFetch';

type EntityType = 'character' | 'organization';
type EntityStatus = 'pending' | 'approved' | 'rejected' | 'merged';

interface PendingEntity {
  id: string;
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  entityType: EntityType;
  name: string;
  extractedData: Record<string, unknown>;
  status: EntityStatus;
  reviewNotes?: string;
  mergedWithId?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface EntitySummary {
  pendingCount: number;
  byType: { character: number; organization: number };
  byChapter: Record<string, number>;
  blockedChapters: number[];
}

interface MatchSuggestion {
  pendingEntityId: string;
  pendingEntityName: string;
  matchedMaterialId: string;
  matchedMaterialName: string;
  matchScore: number;
  matchReason: string;
}

const STATUS_TABS: { id: EntityStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待确认' },
  { id: 'approved', label: '已批准' },
  { id: 'rejected', label: '已拒绝' },
  { id: 'merged', label: '已合并' },
];

export default function PendingEntitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: novelId } = use(params);
  
  const { data, isLoading, refetch } = useFetch<{ entities: PendingEntity[]; summary?: EntitySummary }>(
    `/api/novels/${novelId}/pending-entities?includeSummary=true`,
    { initialData: { entities: [], summary: undefined } }
  );
  
  const [activeTab, setActiveTab] = useState<EntityStatus | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<PendingEntity | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const entities = Array.isArray(data?.entities) ? data.entities : [];
  const summary = data?.summary;

  const filteredEntities = useMemo(() => {
    return entities.filter(entity => {
      const matchesTab = activeTab === 'all' || entity.status === activeTab;
      const matchesSearch = (entity.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [entities, activeTab, searchQuery]);

  const handleSelectEntity = async (entity: PendingEntity) => {
    setSelectedEntity(entity);
    if (entity.status === 'pending') {
      setIsLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/novels/${novelId}/pending-entities/${entity.id}?includeSuggestions=true`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch (error) {
        console.error('Failed to load suggestions:', error);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }
  };

  const handleReview = async (entityId: string, action: 'approve' | 'reject' | 'merge', options?: { mergeWithMaterialId?: string; createMaterial?: boolean; reviewNotes?: string }) => {
    try {
      const res = await fetch(`/api/novels/${novelId}/pending-entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...options }),
      });
      if (res.ok) {
        refetch();
        setSelectedEntity(null);
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to review entity:', error);
    }
  };

  const pendingCount = summary?.pendingCount || (Array.isArray(entities) ? entities.filter(e => e.status === 'pending').length : 0);

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
              <span className="text-4xl">👥</span> 待确认实体
            </h1>
            <p className="text-gray-400">AI 从最新章节中提取的新角色和组织，确认后将加入素材库。</p>
          </div>
          {pendingCount > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-5 py-3 rounded-xl text-sm font-medium shadow-lg shadow-yellow-500/10 animate-pulse flex items-center gap-3">
              <span className="bg-yellow-500/20 p-1.5 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <span><strong>{pendingCount}</strong> 个实体需要确认</span>
            </div>
          )}
        </div>
      </div>

      {summary && summary.blockedChapters.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start gap-4 shadow-xl shadow-red-500/10 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="bg-red-500/20 p-3 rounded-xl shrink-0">
            <svg className="w-8 h-8 text-red-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-red-400 mb-2">章节生成已阻塞</h3>
            <p className="text-red-200/80 leading-relaxed">
              第 <span className="font-mono bg-red-500/20 px-1.5 py-0.5 rounded text-red-100">{summary.blockedChapters.join(', ')}</span> 章有待确认的实体。
              <br/>
              为了保证故事连贯性，AI 必须知道这些新实体的确切身份（是新角色、新组织，还是现有实体的别名）才能继续生成下一章。
            </p>
          </div>
          <div className="self-center">
            <button 
              onClick={() => setActiveTab('pending')}
              className="px-6 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 font-medium whitespace-nowrap"
            >
              立即处理
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            label="待确认" 
            value={summary.pendingCount} 
            color="text-yellow-400" 
            bg="bg-yellow-500/10"
            border="border-yellow-500/20"
          />
          <StatCard 
            label="新角色" 
            value={summary.byType.character} 
            color="text-emerald-400" 
            bg="bg-emerald-500/10"
            border="border-emerald-500/20"
          />
          <StatCard 
            label="新组织" 
            value={summary.byType.organization} 
            color="text-purple-400" 
            bg="bg-purple-500/10"
            border="border-purple-500/20"
          />
          <StatCard 
            label="阻塞章节" 
            value={summary.blockedChapters.length} 
            color={summary.blockedChapters.length > 0 ? "text-red-400" : "text-gray-400"} 
            bg={summary.blockedChapters.length > 0 ? "bg-red-500/10" : "bg-white/5"}
            border={summary.blockedChapters.length > 0 ? "border-red-500/20" : "border-white/5"}
          />
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/5 p-2 rounded-2xl border border-white/5 backdrop-blur-sm sticky top-4 z-30 shadow-xl shadow-black/20">
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
            placeholder="搜索实体名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card h-40 rounded-2xl animate-pulse bg-white/5" />
          ))}
        </div>
      ) : filteredEntities.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEntities.map((entity) => (
            <EntityCard 
              key={entity.id} 
              entity={entity}
              onClick={() => handleSelectEntity(entity)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 opacity-50 flex flex-col items-center">
          <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xl font-bold text-gray-300">
            {activeTab === 'pending' ? '没有待确认的实体' : '暂无实体'}
          </p>
          <p className="text-gray-500 mt-2">
            {activeTab === 'pending' ? '太棒了！所有实体都已确认，章节生成不会被阻塞。' : '切换标签查看其他状态的实体'}
          </p>
        </div>
      )}

      {selectedEntity && (
        <EntityDetailModal
          entity={selectedEntity}
          suggestions={suggestions}
          isLoadingSuggestions={isLoadingSuggestions}
          onClose={() => { setSelectedEntity(null); setSuggestions([]); }}
          onApprove={(createMaterial) => handleReview(selectedEntity.id, 'approve', { createMaterial })}
          onReject={(notes) => handleReview(selectedEntity.id, 'reject', { reviewNotes: notes })}
          onMerge={(materialId) => handleReview(selectedEntity.id, 'merge', { mergeWithMaterialId: materialId })}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg, border }: { label: string; value: number; color: string; bg: string; border: string }) {
  return (
    <div className={`p-5 rounded-2xl ${bg} border ${border} text-center transition-transform hover:scale-105 duration-300`}>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function EntityCard({ entity, onClick }: { entity: PendingEntity; onClick: () => void }) {
  const typeLabel = entity.entityType === 'character' ? '角色' : '组织';
  const extractedData = entity.extractedData as Record<string, string>;
  
  const statusColors: Record<EntityStatus, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
    merged: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };

  const statusLabels: Record<EntityStatus, string> = {
    pending: '待确认',
    approved: '已批准',
    rejected: '已拒绝',
    merged: '已合并',
  };

  return (
    <GlassCard 
      variant="interactive" 
      padding="lg" 
      hover={true} 
      onClick={onClick}
      className="cursor-pointer group relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`p-2 rounded-lg transition-colors ${entity.entityType === 'character' ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20' : 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20'}`}>
            {entity.entityType === 'character' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )}
          </span>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{typeLabel}</span>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${statusColors[entity.status]}`}>
          {statusLabels[entity.status]}
        </span>
      </div>

      <h3 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors line-clamp-1">
        {entity.name}
      </h3>
      
      {extractedData.description && (
        <p className="text-sm text-gray-400 line-clamp-2 mb-4 h-10">{extractedData.description}</p>
      )}
      
      <div className="text-xs text-gray-500 pt-3 border-t border-white/5 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        来源于第 <span className="text-gray-300 font-mono">{entity.chapterNumber}</span> 章
      </div>
    </GlassCard>
  );
}

function EntityDetailModal({ 
  entity, 
  suggestions,
  isLoadingSuggestions,
  onClose, 
  onApprove,
  onReject,
  onMerge,
}: { 
  entity: PendingEntity;
  suggestions: MatchSuggestion[];
  isLoadingSuggestions: boolean;
  onClose: () => void;
  onApprove: (createMaterial: boolean) => void;
  onReject: (notes?: string) => void;
  onMerge: (materialId: string) => void;
}) {
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  
  const extractedData = entity.extractedData as Record<string, string>;
  const isPending = entity.status === 'pending';

  return (
    <Modal isOpen={true} onClose={onClose} title={`${entity.entityType === 'character' ? '👤 角色' : '🏢 组织'}: ${entity.name}`} size="xl">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>
              提取信息
            </h4>
            <div className="glass-input p-5 rounded-2xl space-y-4">
              {Object.entries(extractedData).map(([key, value]) => (
                <div key={key}>
                  <span className="text-xs text-emerald-400 uppercase font-medium mb-1 block">{key}</span>
                  <p className="text-sm text-white leading-relaxed">{String(value) || '-'}</p>
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"/>
              来源信息
            </h4>
            <div className="glass-input p-5 rounded-2xl">
              <p className="text-sm text-gray-400 mb-1">来源章节</p>
              <p className="text-lg text-white font-medium mb-4">第 {entity.chapterNumber} 章</p>
              
              <p className="text-sm text-gray-400 mb-1">提取时间</p>
              <p className="text-sm text-gray-300">
                {new Date(entity.createdAt).toLocaleString()}
              </p>
            </div>
            
            {entity.reviewedAt && (
              <div className="glass-input p-5 rounded-2xl border-t border-white/5">
                <p className="text-sm text-gray-400 mb-1">审核时间</p>
                <p className="text-sm text-gray-300">
                  {new Date(entity.reviewedAt).toLocaleString()}
                </p>
                {entity.reviewNotes && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-sm text-gray-400 mb-1">审核备注</p>
                    <p className="text-sm text-red-300">{entity.reviewNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {isPending && (
          <div className="pt-4 border-t border-white/10">
            {isLoadingSuggestions ? (
              <div className="text-center py-8 text-gray-400 flex flex-col items-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
                正在查找现有素材匹配...
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="text-lg">💡</span> 可能的匹配
                </h4>
                <div className="space-y-2">
                  {suggestions.map((suggestion) => (
                    <div 
                      key={suggestion.matchedMaterialId}
                      className="glass-input p-4 rounded-xl flex items-center justify-between group hover:bg-white/10 transition-colors border border-white/5 hover:border-emerald-500/30"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-bold">{suggestion.matchedMaterialName}</p>
                          <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">匹配度 {Math.round(suggestion.matchScore * 100)}%</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{suggestion.matchReason}</p>
                      </div>
                      <button
                        onClick={() => onMerge(suggestion.matchedMaterialId)}
                        className="text-xs px-4 py-2 bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-all shadow-lg hover:shadow-purple-500/20 whitespace-nowrap"
                      >
                        合并至此素材
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 mb-4">
                <p className="text-sm text-gray-500">未找到相似的现有素材，建议创建新素材。</p>
              </div>
            )}

            {showRejectForm ? (
              <div className="space-y-3 bg-red-500/5 p-4 rounded-xl border border-red-500/10">
                <h4 className="text-sm font-bold text-red-400">拒绝原因</h4>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl min-h-[80px] resize-none focus:border-red-500/30 transition-colors"
                  placeholder="为什么拒绝这个实体..."
                  autoFocus
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowRejectForm(false)}
                    className="btn-secondary px-4 py-2 rounded-lg text-sm"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => onReject(rejectNotes)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm shadow-lg shadow-red-500/30"
                  >
                    确认拒绝
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  onClick={() => setShowRejectForm(true)}
                  className="px-5 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors text-sm hover:shadow-lg hover:shadow-red-500/10"
                >
                  拒绝
                </button>
                <div className="w-px h-8 bg-white/10 mx-2 hidden md:block"></div>
                <button
                  onClick={() => onApprove(false)}
                  className="px-5 py-2.5 bg-white/5 text-gray-300 border border-white/10 rounded-xl hover:bg-white/10 transition-colors text-sm"
                >
                  仅批准 (不创建素材)
                </button>
                <button
                  onClick={() => onApprove(true)}
                  className="btn-primary px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 transition-all"
                >
                  批准并创建素材
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

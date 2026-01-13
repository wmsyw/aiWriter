'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import MaterialSearchModal from './MaterialSearchModal';

type MaterialType = 'character' | 'location' | 'plotPoint' | 'worldbuilding' | 'custom';

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
  { id: 'plotPoint', label: '情节点' },
  { id: 'worldbuilding', label: '世界观' },
  { id: 'custom', label: '自定义' },
];

export default function MaterialsPage() {
  const params = useParams();
  const novelId = params.id as string;
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MaterialType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, [novelId]);

  const fetchMaterials = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/novels/${novelId}/materials`);
      if (res.ok) {
        const data = await res.json();
        setMaterials(data);
      }
    } catch (error) {
      console.error('Failed to fetch materials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMaterials = materials.filter(material => {
    const matchesTab = activeTab === 'all' || material.type === activeTab;
    const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

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
        fetchMaterials();
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to save material:', error);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient mb-2">素材库</h1>
          <p className="text-gray-400">管理你的故事元素、角色和世界观设定</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsSearchModalOpen(true)}
            className="btn-secondary px-5 py-2.5 rounded-xl flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            AI 联网搜索
          </button>
          <button 
            onClick={handleOpenCreate}
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
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
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
        />
      )}

      <MaterialSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        novelId={novelId}
        onComplete={() => {
          fetchMaterials();
          setIsSearchModalOpen(false);
        }}
      />
    </div>
  );
}

function MaterialCard({ material, onClick }: { material: Material; onClick: () => void }) {
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
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
      plotPoint: '情节点',
      worldbuilding: '世界观',
      custom: '自定义',
    };
    return labels[type] || type;
  };

  return (
    <div 
      onClick={onClick}
      className="glass-card p-6 rounded-2xl group cursor-pointer hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2.5 rounded-xl bg-white/5 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/10 transition-all duration-300">
            {getIcon(material.type)}
          </div>
          <span className="text-xs font-medium text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
            {getTypeLabel(material.type)}
          </span>
        </div>
        
        <h3 className="text-lg font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
          {material.name}
        </h3>
        
        <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">
          {getExcerpt(material.data)}
        </p>
      </div>
    </div>
  );
}

function MaterialModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  defaultType 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: any) => Promise<void>; 
  initialData: Material | null;
  defaultType: MaterialType;
}) {
  const [type, setType] = useState<MaterialType>(initialData?.type || defaultType);
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.data?.description || '');
  const [attributes, setAttributes] = useState<Record<string, string>>(initialData?.data?.attributes || {});
  const [isSaving, setIsSaving] = useState(false);

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

  const addAttribute = () => {
    const key = prompt('输入属性名称（例如：年龄、职业、气候）：');
    if (key) {
      setAttributes(prev => ({ ...prev, [key]: '' }));
    }
  };

  const removeAttribute = (key: string) => {
    const newAttrs = { ...attributes };
    delete newAttrs[key];
    setAttributes(newAttrs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      <div className="glass-card w-full max-w-2xl p-8 rounded-2xl relative z-10 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gradient">
            {initialData ? '编辑素材' : '创建素材'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
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
              <button 
                type="button" 
                onClick={addAttribute}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                + 添加属性
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(attributes).map(([key, value]) => (
                <div key={key} className="glass-input p-3 rounded-xl relative group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-indigo-400 uppercase">{key}</span>
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
                    className="bg-transparent w-full text-sm outline-none border-none p-0 focus:ring-0"
                    placeholder="值..."
                  />
                </div>
              ))}
              {Object.keys(attributes).length === 0 && (
                <div className="col-span-full text-center py-4 border border-dashed border-white/10 rounded-xl text-gray-500 text-sm">
                  暂无属性。点击"+ 添加属性"来定义自定义字段。
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
              type="submit"
              disabled={isSaving}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2"
            >
              {isSaving ? '保存中...' : initialData ? '更新素材' : '创建素材'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

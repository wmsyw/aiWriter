'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type MaterialType = 'character' | 'location' | 'plotPoint' | 'worldbuilding' | 'custom';

type MaterialGenre = '男频' | '女频' | '通用';

interface Novel {
  id: string;
  title: string;
}

interface Material {
  id: string;
  novelId: string;
  type: MaterialType;
  name: string;
  genre: MaterialGenre;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MaterialWithNovel extends Material {
  novel?: Novel;
}

const GENRES: { id: MaterialGenre | 'all'; label: string }[] = [
  { id: 'all', label: '全部偏好' },
  { id: '男频', label: '男频' },
  { id: '女频', label: '女频' },
  { id: '通用', label: '通用' },
];

const TABS: { id: MaterialType | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: '全部', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )},
  { id: 'character', label: '角色', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )},
  { id: 'location', label: '地点', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )},
  { id: 'plotPoint', label: '情节点', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )},
  { id: 'worldbuilding', label: '世界观', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )},
  { id: 'custom', label: '自定义', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  )},
];

export default function MaterialsLibraryPage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [materials, setMaterials] = useState<MaterialWithNovel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MaterialType | 'all'>('all');
  const [activeGenre, setActiveGenre] = useState<MaterialGenre | 'all'>('all');
  const [selectedNovel, setSelectedNovel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeGenre]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const novelsRes = await fetch('/api/novels');
      const novelsData = await novelsRes.json();
      setNovels(novelsData.novels || []);

      let url = '/api/materials';
      const params = new URLSearchParams();
      if (activeGenre !== 'all') {
        params.append('genre', activeGenre);
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const matRes = await fetch(url);
      if (matRes.ok) {
        const mats = await matRes.json();
        setMaterials(mats);
      }
    } catch (err) {
      console.error('Failed to fetch materials', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesTab = activeTab === 'all' || m.type === activeTab;
    const matchesNovel = selectedNovel === 'all' || m.novelId === selectedNovel;
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesNovel && matchesSearch;
  });

  const stats = {
    total: materials.length,
    character: materials.filter(m => m.type === 'character').length,
    location: materials.filter(m => m.type === 'location').length,
    plotPoint: materials.filter(m => m.type === 'plotPoint').length,
    worldbuilding: materials.filter(m => m.type === 'worldbuilding').length,
    male: materials.filter(m => m.genre === '男频').length,
    female: materials.filter(m => m.genre === '女频').length,
    general: materials.filter(m => m.genre === '通用').length,
  };

  const getIcon = (type: MaterialType) => {
    const tab = TABS.find(t => t.id === type);
    return tab?.icon || TABS[0].icon;
  };

  const getExcerpt = (data: Record<string, unknown>) => {
    const text = Object.values(data).filter(v => typeof v === 'string').join(' ');
    return text.length > 80 ? text.slice(0, 80) + '...' : text || '暂无描述';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">素材库</h1>
          <p className="text-gray-400 text-sm mt-1">管理所有小说的角色、地点、情节点等创作素材</p>
        </div>
        <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
          {GENRES.map(genre => (
            <button
              key={genre.id}
              onClick={() => setActiveGenre(genre.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeGenre === genre.id
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {genre.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="glass-card rounded-xl p-4 lg:col-span-2">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-sm text-gray-400">全部素材</div>
        </div>
        <div className="glass-card rounded-xl p-4 lg:col-span-2">
          <div className="text-2xl font-bold text-indigo-400">{stats.character}</div>
          <div className="text-sm text-gray-400">角色</div>
        </div>
        <div className="glass-card rounded-xl p-4 lg:col-span-2">
          <div className="text-2xl font-bold text-green-400">{stats.location}</div>
          <div className="text-sm text-gray-400">地点</div>
        </div>
        <div className="glass-card rounded-xl p-4 lg:col-span-2">
          <div className="text-2xl font-bold text-yellow-400">{stats.plotPoint}</div>
          <div className="text-sm text-gray-400">情节点</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 flex-1">
          <select
            value={selectedNovel}
            onChange={(e) => setSelectedNovel(e.target.value)}
            className="glass-input px-4 py-2 rounded-xl"
          >
            <option value="all">所有小说</option>
            {novels.map(novel => (
              <option key={novel.id} value={novel.id}>{novel.title}</option>
            ))}
          </select>

          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索素材..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-10 pr-4 py-2 rounded-xl"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">暂无素材</h3>
          <p className="text-gray-400 mb-6">在小说详情页中添加角色、地点等创作素材</p>
          <Link href="/novels" className="btn-primary px-6 py-2 rounded-xl inline-block">
            查看我的小说
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map(material => (
            <Link
              key={material.id}
              href={`/novels/${material.novelId}/materials`}
              className="glass-card rounded-2xl p-5 hover:border-indigo-500/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-xl ${
                  material.type === 'character' ? 'bg-indigo-500/10 text-indigo-400' :
                  material.type === 'location' ? 'bg-green-500/10 text-green-400' :
                  material.type === 'plotPoint' ? 'bg-yellow-500/10 text-yellow-400' :
                  material.type === 'worldbuilding' ? 'bg-purple-500/10 text-purple-400' :
                  'bg-gray-500/10 text-gray-400'
                }`}>
                  {getIcon(material.type)}
                </div>
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
                  {material.novel?.title || '未知小说'}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                {material.name}
              </h3>

              <p className="text-sm text-gray-400 line-clamp-2">
                {getExcerpt(material.data)}
              </p>

              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <div className="flex gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    material.type === 'character' ? 'bg-indigo-500/20 text-indigo-400' :
                    material.type === 'location' ? 'bg-green-500/20 text-green-400' :
                    material.type === 'plotPoint' ? 'bg-yellow-500/20 text-yellow-400' :
                    material.type === 'worldbuilding' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {TABS.find(t => t.id === material.type)?.label || material.type}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    material.genre === '男频' ? 'bg-blue-500/20 text-blue-400' :
                    material.genre === '女频' ? 'bg-pink-500/20 text-pink-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {material.genre}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(material.updatedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

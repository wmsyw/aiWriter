'use client';

import Link from 'next/link';
import GlassCard from '@/app/components/ui/GlassCard';
import { useFetch } from '@/src/hooks/useFetch';

interface Novel {
  id: string;
  title: string;
  updatedAt: string;
  _count?: {
    chapters: number;
  };
}

interface NovelsResponse {
  novels: Novel[];
}

export default function NovelsPage() {
  const { data, isLoading } = useFetch<NovelsResponse>('/api/novels');
  const novels = data?.novels || [];

  return (
    <div className="min-h-screen p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">我的小说</h1>
          <p className="text-gray-400">管理和创作你的杰作</p>
        </div>
          <Link
            href="/novels/create"
            className="btn-primary px-6 py-3 rounded-xl flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建小说
          </Link>
        </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card h-48 rounded-2xl" />
          ))}
        </div>
      ) : novels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
          {novels.map((novel) => (
            <Link
              href={`/novels/${novel.id}`}
              key={novel.id}
              className="block h-full"
            >
              <GlassCard
                variant="interactive"
                padding="md"
                hover
                className="h-full relative overflow-hidden hover:border-indigo-500/50"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
                
                <div className="h-full flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors line-clamp-1">
                      {novel.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {novel._count?.chapters || 0} 章
                      </span>
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t border-white/5 flex items-center justify-between mt-4">
                    <span className="text-xs text-gray-500">
                      更新于 {new Date(novel.updatedAt).toLocaleDateString()}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in text-center">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">暂无小说</h3>
          <p className="text-gray-400 max-w-sm mb-8">
            使用我们的 AI 工具创建第一本小说，开启写作之旅。
          </p>
          <Link
            href="/novels/create"
            className="btn-primary px-8 py-3 rounded-xl"
          >
            创建第一本小说
          </Link>
        </div>
      )}
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, Button, Skeleton, Badge } from '@/app/components/ui';
import { useFetch } from '@/src/hooks/useFetch';
import { staggerContainer, staggerItem } from '@/app/lib/animations';

interface Novel {
  id: string;
  title: string;
  description?: string;
  genre?: string;
  wizardStatus?: string;
  updatedAt: string;
  chapters?: { id: string }[];
  _count?: {
    chapters: number;
  };
}

interface NovelsResponse {
  novels: Novel[];
}

const statusMap: Record<string, { label: string; variant: 'queued' | 'info' | 'success' | 'default' }> = {
  draft: { label: '草稿', variant: 'queued' },
  in_progress: { label: '连载中', variant: 'info' },
  completed: { label: '已完结', variant: 'success' },
};

export default function NovelsPage() {
  const router = useRouter();
  const { data, isLoading } = useFetch<NovelsResponse>('/api/novels');
  const novels = data?.novels || [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 tracking-tight text-zinc-100">我的小说</h1>
          <p className="text-zinc-500">管理和创作你的杰作</p>
        </div>
        <Button
          onClick={() => router.push('/novels/create')}
          leftIcon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          新建小说
        </Button>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rect" className="h-64 rounded-2xl bg-zinc-800/50" />
          ))}
        </div>
      ) : novels.length > 0 ? (
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {novels.map((novel) => {
            const chapterCount = novel._count?.chapters || novel.chapters?.length || 0;
            const status = statusMap[novel.wizardStatus || 'draft'] || statusMap.draft;
            
            return (
              <motion.div
                key={novel.id}
                variants={staggerItem}
                className="h-full"
              >
                <Link
                  href={`/novels/${novel.id}`}
                  className="block h-full group outline-none"
                >
                  <Card
                    variant="interactive"
                    className="h-full relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 backdrop-blur-sm border-white/5 group-hover:border-emerald-500/30 group-hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] group-hover:shadow-emerald-900/10 group-focus:ring-2 ring-emerald-500/50"
                  >
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-500" />
                    
                    <CardContent className="h-full p-7 !pt-7 flex flex-col">
                      <div className="flex justify-between items-start gap-4 mb-4 relative z-10">
                        <h3 className="text-xl font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-1 leading-tight flex-1">
                          {novel.title}
                        </h3>
                        <Badge variant={status.variant} size="sm" className="shrink-0 font-normal">
                          {status.label}
                        </Badge>
                      </div>
                      
                      <div className="flex-grow relative z-10">
                        <p className="text-sm text-zinc-400/80 line-clamp-3 mb-5 min-h-[4.5em] leading-relaxed">
                          {novel.description || '暂无简介，点击开始创作...'}
                        </p>
                        
                        {novel.genre && (
                          <div className="flex flex-wrap gap-2 mb-5">
                            <Badge variant="outline" size="sm" className="text-zinc-500 border-zinc-700/50 group-hover:border-emerald-500/30 group-hover:text-emerald-400/70 transition-colors">
                              {novel.genre}
                            </Badge>
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-5 border-t border-white/5 flex items-center justify-between mt-auto relative z-10">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span className="font-medium">{chapterCount} 章节</span>
                          </div>
                          <span className="text-[10px] text-zinc-600">
                            更新于 {new Date(novel.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-zinc-950 transition-all duration-300 transform group-hover:scale-110 shadow-lg shadow-transparent group-hover:shadow-emerald-500/25">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
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
          <Button
            onClick={() => router.push('/novels/create')}
            size="lg"
          >
            创建第一本小说
          </Button>
        </div>
      )}
    </div>
  );
}

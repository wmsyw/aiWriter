'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, Button, Skeleton, Badge, Select } from '@/app/components/ui';
import { useFetch } from '@/src/hooks/useFetch';
import { staggerContainer, staggerItem } from '@/app/lib/animations';
import {
  buildNovelsLibraryStats,
  filterAndSortNovels,
  getNovelChapterCount,
  getSortModeOptions,
  getStatusFilterOptions,
  type NovelLibraryRecord,
  type NovelSortMode,
  type NovelStatusFilter,
} from '@/src/shared/novels-library';

interface NovelsResponse {
  novels: NovelLibraryRecord[];
}

const statusMap: Record<string, { label: string; variant: 'queued' | 'info' | 'success' | 'default' }> = {
  draft: { label: '草稿', variant: 'queued' },
  in_progress: { label: '连载中', variant: 'info' },
  completed: { label: '已完结', variant: 'success' },
};

const STATUS_OPTIONS = getStatusFilterOptions().map((item) => ({ value: item.value, label: item.label }));
const SORT_OPTIONS = getSortModeOptions().map((item) => ({ value: item.value, label: item.label }));

export default function NovelsPage() {
  const router = useRouter();
  const { data, isLoading } = useFetch<NovelsResponse>('/api/novels');
  const novels = data?.novels || [];

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<NovelStatusFilter>('all');
  const [sortMode, setSortMode] = useState<NovelSortMode>('updated_desc');

  const filteredNovels = useMemo(
    () => filterAndSortNovels(novels, { query, status: statusFilter, sort: sortMode }),
    [novels, query, statusFilter, sortMode],
  );

  const stats = useMemo(
    () => buildNovelsLibraryStats(novels, filteredNovels.length),
    [novels, filteredNovels.length],
  );

  const hasActiveFilters = query.trim().length > 0 || statusFilter !== 'all';

  return (
    <div className="space-y-8 pb-8">
      <div className="page-header items-start gap-4">
        <div>
          <h1 className="page-title">我的小说</h1>
          <p className="page-subtitle">管理和创作你的杰作</p>
        </div>
        <Button
          size="sm"
          className="min-w-[108px]"
          onClick={() => router.push('/novels/create')}
          leftIcon={(
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        >
          新建小说
        </Button>
      </div>

      {!isLoading && novels.length > 0 && (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="space-y-4 p-5 md:p-6">
            <div className="grid gap-4 md:grid-cols-[1.5fr_1fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">搜索作品</label>
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="glass-input h-10 w-full rounded-xl px-4 pr-10"
                    placeholder="按标题、简介、题材搜索..."
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                      aria-label="清空搜索"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <Select
                label="状态筛选"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as NovelStatusFilter)}
                options={STATUS_OPTIONS}
              />

              <Select
                label="排序方式"
                value={sortMode}
                onChange={(value) => setSortMode(value as NovelSortMode)}
                options={SORT_OPTIONS}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline" className="text-zinc-300 border-white/15">总计 {stats.total} 本</Badge>
              <Badge variant="outline" className="text-zinc-300 border-white/15">草稿 {stats.draft}</Badge>
              <Badge variant="outline" className="text-zinc-300 border-white/15">连载中 {stats.inProgress}</Badge>
              <Badge variant="outline" className="text-zinc-300 border-white/15">已完结 {stats.completed}</Badge>
              <Badge variant="outline" className="text-zinc-300 border-white/15">章节总数 {stats.totalChapters}</Badge>
              {hasActiveFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-zinc-300 border border-white/10"
                  onClick={() => {
                    setQuery('');
                    setStatusFilter('all');
                    setSortMode('updated_desc');
                  }}
                >
                  清空筛选
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} variant="rect" className="h-64 rounded-2xl bg-zinc-800/50" />
          ))}
        </div>
      ) : novels.length > 0 && filteredNovels.length > 0 ? (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {filteredNovels.map((novel) => {
            const chapterCount = getNovelChapterCount(novel);
            const status = statusMap[novel.wizardStatus || 'draft'] || statusMap.draft;

            return (
              <motion.div key={novel.id} variants={staggerItem} className="h-full">
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

                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/90 group-hover:text-zinc-950 transition-all duration-300 transform group-hover:scale-110 shadow-lg shadow-transparent group-hover:shadow-emerald-500/25">
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
      ) : novels.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in text-center">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">没有匹配的作品</h3>
          <p className="text-gray-400 max-w-sm mb-8">
            当前筛选条件下没有结果，建议调整状态或关键词。
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('');
              setStatusFilter('all');
              setSortMode('updated_desc');
            }}
          >
            清空筛选条件
          </Button>
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
          <Button
            onClick={() => router.push('/novels/create')}
            size="lg"
            leftIcon={(
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          >
            创建第一本小说
          </Button>
        </div>
      )}
    </div>
  );
}

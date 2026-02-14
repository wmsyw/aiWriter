'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/app/components/ui/Button';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { staggerContainer, staggerItem } from '@/app/lib/animations';
import { useDashboardData } from '@/app/lib/hooks/useDashboardData';
import {
  formatDashboardNumber,
  formatRelativeDate,
  getDashboardGreeting,
} from '@/src/shared/dashboard';

const RECENT_LOADING_PLACEHOLDERS = [1, 2, 3, 4];

interface QuickAction {
  id: string;
  title: string;
  description: string;
  to: string;
  color: 'emerald' | 'blue' | 'amber';
  icon: ReactNode;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create',
    title: '创建新作品',
    description: '从灵感到大纲',
    to: '/novels/create',
    color: 'emerald',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    id: 'continue',
    title: '继续写作',
    description: '打开近期作品',
    to: '/novels',
    color: 'blue',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    ),
  },
  {
    id: 'agents',
    title: 'AI 代理',
    description: '配置写作助手',
    to: '/agents',
    color: 'amber',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const {
    recentNovels,
    loading,
    jobsLoading,
    error,
    stats,
    lastUpdatedAt,
    isUsingSse,
    refresh,
  } = useDashboardData();

  const greeting = useMemo(() => getDashboardGreeting(), []);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-8"
    >
      <motion.div variants={staggerItem} className="page-header items-start gap-4">
        <div>
          <h1 className="page-title">{greeting}</h1>
          <p className="page-subtitle">工作台已就绪，开始今天的创作。</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
          <Button
            size="sm"
            variant="ghost"
            className="min-w-[92px]"
            onClick={() => void refresh()}
            leftIcon={<RotateIcon className="w-4 h-4" />}
          >
            刷新
          </Button>
          <Button
            size="sm"
            className="min-w-[108px]"
            onClick={() => router.push('/novels/create')}
            leftIcon={<PlusIcon className="w-4 h-4" />}
          >
            开始创作
          </Button>
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="作品" value={stats.novelsCount} icon={<BookIcon />} color="emerald" />
        <StatsCard title="章节" value={stats.totalChapters} icon={<DocumentIcon />} color="blue" />
        <StatsCard
          title="字数"
          value={formatDashboardNumber(stats.totalWords)}
          icon={<PencilIcon />}
          color="amber"
        />
        <StatsCard title="任务" value={stats.activeJobsCount} icon={<ClockIcon />} color="zinc" />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div variants={staggerItem} className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-200">
              <span className="h-5 w-1 rounded-full bg-emerald-500" />
              近期作品
            </h2>
            <Link
              href="/novels"
              className="group flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-emerald-500"
            >
              查看全部
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
              <div className="flex items-center justify-between gap-3">
                <span>{error}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-200" onClick={() => void refresh()}>
                  重试
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {RECENT_LOADING_PLACEHOLDERS.map((item) => (
                <Skeleton key={item} variant="rect" className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : recentNovels.length > 0 ? (
            <motion.div variants={staggerContainer} className="space-y-2">
              {recentNovels.map((novel) => (
                <motion.div key={novel.id} variants={staggerItem}>
                  <Link href={`/novels/${novel.id}`}>
                    <div className="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-all hover:border-zinc-700 hover:bg-zinc-900">
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-12 w-10 flex-shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-800 transition-colors group-hover:border-emerald-500/30">
                            <BookIcon className="h-5 w-5 text-zinc-600 transition-colors group-hover:text-emerald-500" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-medium text-zinc-200 transition-colors group-hover:text-emerald-400">
                              {novel.title}
                            </h3>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{novel.genre}</span>
                              <span title={new Date(novel.updatedAt).toLocaleString()}>
                                {formatRelativeDate(novel.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-6">
                          <div className="hidden text-right sm:block">
                            <div className="font-mono text-sm text-zinc-400">
                              {(novel.wordCount || 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-zinc-600">{novel.chapterCount || 0} 章</div>
                          </div>
                          <ArrowRightIcon className="h-4 w-4 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-500" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
                <BookIcon className="h-8 w-8 text-zinc-600" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-zinc-300">暂无作品</h3>
              <p className="mb-6 text-sm text-zinc-500">创建你的第一个故事</p>
              <Button onClick={() => router.push('/novels/create')}>开始创作</Button>
            </div>
          )}
        </motion.div>

        <motion.div variants={staggerItem} className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-200">
            <span className="h-5 w-1 rounded-full bg-amber-500" />
            快速操作
          </h2>

          <div className="space-y-3">
            {QUICK_ACTIONS.map((action) => (
              <ActionCard
                key={action.id}
                title={action.title}
                description={action.description}
                icon={action.icon}
                color={action.color}
                onClick={() => router.push(action.to)}
              />
            ))}
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/6 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-300">
              <ClockIcon className="h-4 w-4" />
              任务队列状态
            </h3>
            <p className="text-xs leading-relaxed text-zinc-400">
              当前活跃任务 <span className="font-semibold text-zinc-200">{stats.activeJobsCount}</span> 个，
              {jobsLoading ? '正在同步队列状态' : isUsingSse ? '已启用实时同步' : '当前使用轮询同步'}。
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>{lastUpdatedAt ? `更新于 ${new Date(lastUpdatedAt).toLocaleTimeString()}` : '等待首次同步'}</span>
              <Link href="/jobs" className="text-blue-300 hover:text-blue-200">
                查看任务
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
              <InfoIcon className="h-4 w-4" />
              创作提示
            </h3>
            <p className="text-xs leading-relaxed text-zinc-500">
              在素材库中完善角色设定，可以让 AI 写出更符合人设与剧情目标的内容。
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  color: 'emerald' | 'blue' | 'amber' | 'zinc';
}) {
  const colorClassMap = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
    zinc: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
  } as const;

  return (
    <motion.div variants={staggerItem}>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className={`rounded-lg border p-2 ${colorClassMap[color]}`}>
            <div className="h-4 w-4">{icon}</div>
          </div>
        </div>
        <div className="mb-0.5 text-2xl font-bold text-zinc-100">{value}</div>
        <div className="text-xs text-zinc-500">{title}</div>
      </div>
    </motion.div>
  );
}

function ActionCard({
  title,
  description,
  icon,
  color,
  onClick,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  color: 'emerald' | 'blue' | 'amber';
  onClick: () => void;
}) {
  const hoverClassMap = {
    emerald: 'hover:border-emerald-500/30 hover:bg-emerald-500/8 hover:text-emerald-300',
    blue: 'hover:border-blue-500/30 hover:bg-blue-500/8 hover:text-blue-300',
    amber: 'hover:border-amber-500/30 hover:bg-amber-500/8 hover:text-amber-300',
  } as const;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`group h-auto w-full justify-start rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-4 text-left transition-all ${hoverClassMap[color]}`}
    >
      <div className="flex items-center gap-3">
        <div className="text-zinc-500 transition-colors group-hover:text-current">{icon}</div>
        <div>
          <h3 className="text-sm font-medium text-zinc-200 transition-colors group-hover:text-current">
            {title}
          </h3>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
    </Button>
  );
}

function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function RotateIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 4v6h6M20 20v-6h-6M6.5 14.5A7 7 0 0020 12M17.5 9.5A7 7 0 004 12"
      />
    </svg>
  );
}

function ArrowRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

function DocumentIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function PencilIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/app/components/ui/Button';
import { Card, CardContent } from '@/app/components/ui/Card';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { staggerContainer, staggerItem } from '@/app/lib/animations';

interface Novel {
  id: string;
  title: string;
  genre: string;
  updatedAt: string;
  wordCount?: number;
  chapterCount?: number;
}

interface Job {
  id: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobsCount, setJobsCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [novelsRes, jobsRes] = await Promise.all([
          fetch('/api/novels'),
          fetch('/api/jobs')
        ]);

        if (novelsRes.ok) {
          const data = await novelsRes.json();
          setNovels(data.novels || []);
        }
        
        if (jobsRes.ok) {
          const data = await jobsRes.json();
          setJobsCount(data.jobs?.filter((j: Job) => j.status === 'pending' || j.status === 'processing').length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalWords = novels.reduce((acc, curr) => acc + (curr.wordCount || 0), 0);
  const totalChapters = novels.reduce((acc, curr) => acc + (curr.chapterCount || 0), 0);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，注意休息';
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-8"
    >
      <motion.div variants={staggerItem} className="page-header items-start gap-4">
        <div>
          <h1 className="page-title">{getGreeting()}</h1>
          <p className="page-subtitle">开启创作的一天</p>
        </div>
        <div className="hidden md:flex">
          <Button 
            size="sm"
            className="min-w-[108px]"
            onClick={() => router.push('/novels/create')}
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            开始创作
          </Button>
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
          title="作品" 
          value={novels.length} 
          icon={<BookIcon />}
          color="emerald"
        />
        <StatsCard 
          title="章节" 
          value={totalChapters} 
          icon={<DocumentIcon />}
          color="blue"
        />
        <StatsCard 
          title="字数" 
          value={formatNumber(totalWords)}
          icon={<PencilIcon />}
          color="amber"
        />
        <StatsCard 
          title="任务" 
          value={jobsCount} 
          icon={<ClockIcon />}
          color="zinc"
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={staggerItem} className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
              <span className="w-1 h-5 bg-emerald-500 rounded-full"></span>
              近期作品
            </h2>
            <Link href="/novels" className="text-sm text-zinc-500 hover:text-emerald-500 transition-colors flex items-center gap-1 group">
              查看全部 
              <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
            
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rect" className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : novels.length > 0 ? (
            <motion.div variants={staggerContainer} className="space-y-2">
              {novels.slice(0, 5).map((novel) => (
                <motion.div key={novel.id} variants={staggerItem}>
                  <Link href={`/novels/${novel.id}`}>
                    <div className="group p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-12 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:border-emerald-500/30 transition-colors">
                            <BookIcon className="w-5 h-5 text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">{novel.title}</h3>
                            <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{novel.genre}</span>
                              <span>{new Date(novel.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 flex-shrink-0">
                          <div className="text-right hidden sm:block">
                            <div className="text-sm font-mono text-zinc-400">{(novel.wordCount || 0).toLocaleString()}</div>
                            <div className="text-xs text-zinc-600">{novel.chapterCount || 0} 章</div>
                          </div>
                          <svg className="w-4 h-4 text-zinc-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="p-12 text-center rounded-lg border-2 border-dashed border-zinc-800 bg-zinc-900/30">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookIcon className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium mb-2 text-zinc-300">暂无作品</h3>
              <p className="text-zinc-500 mb-6 text-sm">创建你的第一个故事</p>
              <Button 
                onClick={() => router.push('/novels/create')}
              >
                开始创作
              </Button>
            </div>
          )}
        </motion.div>

        <motion.div variants={staggerItem} className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
            <span className="w-1 h-5 bg-amber-500 rounded-full"></span>
            快速操作
          </h2>
          <div className="space-y-3">
            <ActionCard 
              title="创建新作品"
              description="从灵感到大纲"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              }
              color="emerald"
              onClick={() => router.push('/novels/create')}
            />
            <ActionCard 
              title="继续写作"
              description="回到上次编辑"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
              color="blue"
              onClick={() => router.push('/novels')}
            />
            <ActionCard 
              title="AI 代理"
              description="配置写作助手"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
              color="amber"
              onClick={() => router.push('/agents')}
            />
          </div>

          <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <h3 className="font-medium mb-2 text-amber-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              小贴士
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              在素材库中完善角色设定，可以让 AI 写出更符合人设的内容。
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toLocaleString();
}

function StatsCard({ title, value, icon, color }: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  color: 'emerald' | 'blue' | 'amber' | 'zinc';
}) {
  const colors = {
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    zinc: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  };

  return (
    <motion.div variants={staggerItem}>
      <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg border ${colors[color]}`}>
            <div className="w-4 h-4">
              {icon}
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold text-zinc-100 mb-0.5">{value}</div>
        <div className="text-xs text-zinc-500">{title}</div>
      </div>
    </motion.div>
  );
}

function ActionCard({ title, description, icon, color, onClick }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: 'emerald' | 'blue' | 'amber';
  onClick: () => void;
}) {
  const colors = {
    emerald: 'hover:text-emerald-300 hover:border-emerald-500/30 hover:bg-emerald-500/8',
    blue: 'hover:text-blue-300 hover:border-blue-500/30 hover:bg-blue-500/8',
    amber: 'hover:text-amber-300 hover:border-amber-500/30 hover:bg-amber-500/8',
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`group h-auto w-full justify-start rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-4 text-left transition-all ${colors[color]}`}
    >
      <div className="flex items-center gap-3">
        <div className="text-zinc-500 group-hover:text-current transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="font-medium text-zinc-200 group-hover:text-current transition-colors text-sm">{title}</h3>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
    </Button>
  );
}

function BookIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function DocumentIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

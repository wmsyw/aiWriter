'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/app/components/ui/Button';
import { Card, CardContent } from '@/app/components/ui/Card';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { staggerContainer, staggerItem } from '@/app/lib/animations';
import { cn } from '@/app/lib/utils';

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

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，注意休息';
    if (hour < 12) return '早上好，开启创作的一天';
    if (hour < 18) return '下午好，保持灵感';
    return '晚上好，享受静谧时光';
  };

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-10 pb-10"
    >
      <motion.div variants={staggerItem} className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold mb-2 tracking-tight text-white">{getGreeting()}</h1>
          <p className="text-gray-400 text-lg">今天也是充满创意的一天</p>
        </div>
        <div className="hidden md:block">
           <Button 
             onClick={() => router.push('/novels/create')}
             size="lg"
             leftIcon={
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
               </svg>
             }
           >
             开始创作
           </Button>
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
            title="小说总数" 
            value={novels.length} 
            icon={<BookIcon />}
            gradient="from-blue-500/20 to-cyan-500/20"
            border="border-blue-500/30"
            iconColor="text-cyan-400"
        />
        <StatsCard 
            title="章节总数" 
            value={totalChapters} 
            icon={<DocumentIcon />}
            gradient="from-purple-500/20 to-pink-500/20"
            border="border-purple-500/30"
            iconColor="text-purple-400"
        />
        <StatsCard 
            title="累计字数" 
            value={totalWords.toLocaleString()} 
            icon={<PencilIcon />}
            gradient="from-amber-500/20 to-orange-500/20"
            border="border-amber-500/30"
            iconColor="text-amber-400"
        />
        <StatsCard 
            title="排队任务" 
            value={jobsCount} 
            icon={<ClockIcon />}
            gradient="from-emerald-500/20 to-teal-500/20"
            border="border-emerald-500/30"
            iconColor="text-emerald-400"
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div variants={staggerItem} className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                  最近作品
                </h2>
                <Link href="/novels" className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 group">
                  查看全部 
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
            </div>
            
            {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="rect" className="h-32 w-full rounded-2xl" />
                  ))}
                </div>
            ) : novels.length > 0 ? (
                <motion.div variants={staggerContainer} className="grid gap-4">
                    {novels.slice(0, 5).map((novel) => (
                        <motion.div key={novel.id} variants={staggerItem}>
                          <Link href={`/novels/${novel.id}`}>
                              <Card variant="interactive" className="group border-l-4 border-l-transparent hover:border-l-indigo-500">
                                  <CardContent className="p-5 flex items-center justify-between">
                                      <div className="flex items-center gap-5">
                                          <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 flex items-center justify-center shadow-md group-hover:shadow-indigo-500/20 transition-all">
                                            <BookIcon className="w-6 h-6 text-gray-600 group-hover:text-indigo-400 transition-colors" />
                                          </div>
                                          <div>
                                              <h3 className="font-bold text-lg text-gray-200 group-hover:text-indigo-400 transition-colors">{novel.title}</h3>
                                              <div className="text-sm text-gray-500 mt-1 flex items-center gap-3">
                                                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-xs">{novel.genre}</span>
                                                  <span>{new Date(novel.updatedAt).toLocaleDateString()}</span>
                                              </div>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-8">
                                          <div className="text-right hidden sm:block">
                                              <div className="text-sm font-medium text-gray-300 font-mono">{novel.wordCount?.toLocaleString() || 0} 字</div>
                                              <div className="text-xs text-gray-500">{novel.chapterCount || 0} 章</div>
                                          </div>
                                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                            <svg className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </div>
                                      </div>
                                  </CardContent>
                              </Card>
                          </Link>
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                <Card className="p-12 text-center border-dashed border-2 border-white/10 bg-transparent">
                    <CardContent className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                            <BookIcon className="w-10 h-10 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-bold mb-2 text-white">暂无小说</h3>
                        <p className="text-gray-400 mb-8 max-w-md mx-auto">您的书架空空如也。创建一个新项目，开始您的创作之旅吧。</p>
                        <Button 
                            onClick={() => router.push('/novels/create')}
                            size="lg"
                            className="shadow-xl shadow-indigo-500/20"
                        >
                            创建第一本小说
                        </Button>
                    </CardContent>
                </Card>
            )}
        </motion.div>

        <motion.div variants={staggerContainer} className="space-y-8">
            <motion.h2 variants={staggerItem} className="text-2xl font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-pink-500 rounded-full"></span>
              快速操作
            </motion.h2>
            <motion.div variants={staggerContainer} className="grid gap-4">
                <motion.div variants={staggerItem}>
                    <Card 
                        variant="interactive" 
                        className="group relative overflow-hidden cursor-pointer"
                        onClick={() => router.push('/novels/create')}
                    >
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all"></div>
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/20 z-10">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                            <div className="z-10">
                                <h3 className="font-bold mb-1 text-lg group-hover:text-indigo-400 transition-colors">创建小说</h3>
                                <p className="text-sm text-gray-400">从头开始创作新故事或使用模板</p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={staggerItem}>
                    <Card 
                        variant="interactive" 
                        className="group relative overflow-hidden cursor-pointer"
                        onClick={() => router.push('/novels')}
                    >
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-pink-500/20 transition-all"></div>
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg shadow-pink-500/20 z-10">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <div className="z-10">
                                <h3 className="font-bold mb-1 text-lg group-hover:text-pink-400 transition-colors">生成章节</h3>
                                <p className="text-sm text-gray-400">继续刚才的写作</p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
                
                <motion.div variants={staggerItem}>
                    <Card className="relative overflow-hidden border-amber-500/20">
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5"></div>
                      <CardContent className="p-6 relative z-10">
                          <h3 className="font-bold mb-3 text-amber-400 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            写作小贴士
                          </h3>
                          <p className="text-sm text-gray-400 leading-relaxed">
                            在"素材库"中完善角色设定，可以让 AI 写出更符合人设的对话和行为。记得经常更新人物关系图哦！
                          </p>
                      </CardContent>
                    </Card>
                </motion.div>
            </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function StatsCard({ title, value, icon, gradient, border, iconColor }: { title: string, value: string | number, icon: React.ReactNode, gradient: string, border: string, iconColor: string }) {
    return (
        <motion.div variants={staggerItem}>
            <Card variant="interactive" className={`relative overflow-hidden group border ${border}`}>
                <CardContent className="p-6">
                    <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${gradient} rounded-full blur-2xl group-hover:blur-3xl transition-all opacity-50`}></div>
                    <div className="relative z-10">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`p-3 rounded-xl bg-white/5 border border-white/10 ${iconColor}`}>
                              <div className="w-6 h-6">
                                  {icon}
                              </div>
                          </div>
                          <div className={`text-xs font-medium px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400`}>
                            +0%
                          </div>
                        </div>
                        <div className="text-3xl font-bold mb-1 text-white tracking-tight">{value}</div>
                        <div className="text-sm text-gray-400">{title}</div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}

function BookIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
    )
}

function DocumentIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    )
}

function PencilIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    )
}

function ClockIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )
}

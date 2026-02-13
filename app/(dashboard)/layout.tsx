'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useRef } from 'react';
import { getJobStatusLabel, getJobStatusClassName, getJobTypeLabel } from '@/app/components/JobStatusBadge';

interface Notification {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

interface UserInfo {
  id: string;
  email: string;
  role: string;
}

const SIDEBAR_STORAGE_KEY = 'aiwriter.sidebarCollapsed';

const PATH_LABELS: Record<string, string> = {
  dashboard: '工作台',
  novels: '作品库',
  create: '新建作品',
  templates: '模板管理',
  agents: 'AI 代理',
  jobs: '任务中心',
  settings: '系统设置',
  admin: '审计日志',
  materials: '资料库',
  hooks: '钩子管理',
  graph: '关系图谱',
  chapters: '章节',
  'pending-entities': '待处理实体',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === '1') {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/jobs');
        if (res.ok) {
          const jobs = await res.json();
          setNotifications((Array.isArray(jobs) ? jobs : []).slice(0, 5));
        }
      } catch (error) {
        console.error('Failed to fetch notifications', error);
      }
    };
    fetchNotifications();

    const eventSource = new EventSource('/api/jobs/stream');
    
    eventSource.addEventListener('jobs', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.jobs && Array.isArray(data.jobs)) {
          setNotifications(data.jobs.slice(0, 5));
        }
      } catch (error) {
        console.error('Failed to parse SSE data', error);
      }
    });

    eventSource.onerror = () => {
      console.error('SSE connection error');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await fetch('/api/user/me');
        if (res.ok) {
          const user = await res.json();
          setUserInfo(user);
        }
      } catch (error) {
        console.error('Failed to fetch user info', error);
      }
    };
    fetchUserInfo();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'queued' || n.status === 'running').length;

  const navItems = [
    { name: '工作台', href: '/dashboard', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { name: '作品库', href: '/novels', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )},
    { name: '模板', href: '/templates', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
    { name: 'AI 代理', href: '/agents', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )},
    { name: '任务', href: '/jobs', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    )},
    { name: '设置', href: '/settings', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
  ];

  const sidebarWidth = sidebarCollapsed ? 'w-20' : 'w-64';

  const activeNav = useMemo(
    () => navItems.find(i => pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))) || navItems[0],
    [pathname]
  );

  const breadcrumb = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return ['工作台'];

    return segments
      .map((segment) => PATH_LABELS[segment] || '详情')
      .filter((label, index, arr) => label && (index === 0 || label !== arr[index - 1]));
  }, [pathname]);

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 flex font-sans relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.08),transparent_40%)]" />
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        ref={sidebarRef}
        className={`${sidebarWidth} bg-zinc-900/90 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col fixed top-0 left-0 h-screen z-40 transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="主导航"
      >
        <div className={`p-4 ${sidebarCollapsed ? 'px-3' : 'px-5'} border-b border-zinc-800/80`}>
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <span className="text-xl font-bold text-zinc-100 tracking-tight">
                墨笔
              </span>
            )}
          </Link>
        </div>
        
        {!sidebarCollapsed && (
          <div className="p-4 px-5">
            <Link href="/novels/create" className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>开始创作</span>
            </Link>
          </div>
        )}
        
        <nav className={`flex-1 ${sidebarCollapsed ? 'px-2' : 'px-3'} space-y-1 overflow-y-auto py-4 custom-scrollbar`}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                title={sidebarCollapsed ? item.name : undefined}
                className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-3' : 'px-3'} py-2.5 rounded-lg transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]' 
                    : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-r-full"></div>
                )}
                <span className={isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}>
                  {item.icon}
                </span>
                {!sidebarCollapsed && (
                  <span className="text-sm">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={`p-4 ${sidebarCollapsed ? 'px-2' : 'px-3'} border-t border-zinc-800/80`}>
          {sidebarCollapsed ? (
            <button  
              onClick={handleLogout}
              className="w-full p-2.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
              title="退出登录"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center font-medium text-sm text-zinc-300 border border-zinc-700">
                {userInfo?.email?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate">{userInfo?.email?.split('@')[0] || '加载中...'}</div>
                <div className="text-xs text-zinc-500 truncate">{userInfo?.email || ''}</div>
              </div>
              <button  
                onClick={handleLogout}
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="退出登录"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-zinc-900 border border-zinc-700/80 rounded-full items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg className={`w-3 h-3 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </aside>

      <main className={`flex-1 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} flex flex-col min-h-screen relative z-10 overflow-y-auto transition-all duration-300`}>
        <header className="min-h-[var(--dashboard-topbar-height)] py-2 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 bg-zinc-950/88 backdrop-blur-xl border-b border-zinc-800/60">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
              aria-label="打开菜单"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0 hidden sm:block">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 truncate">
                {breadcrumb.join(' / ')}
              </div>
              <div className="text-sm font-medium text-zinc-200 truncate">
                {activeNav.name}
              </div>
            </div>
          </div>
           
          <div className="flex items-center gap-2 sm:gap-3 relative" ref={notificationRef}>
            <Link
              href="/novels/create"
              className="hidden md:inline-flex btn-secondary h-9 px-3 text-xs"
            >
              新建作品
            </Link>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200 relative"
              aria-label="通知"
            >
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-zinc-950"></span>
              )}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
             
            {showNotifications && (
              <div className="absolute right-0 top-[calc(var(--dashboard-topbar-height)-0.5rem)] w-80 glass-card border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-100">通知</h3>
                  <Link href="/jobs" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
                    查看全部
                  </Link>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                      暂无通知
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <Link
                        key={n.id}
                        href="/jobs"
                        className="block p-4 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/50 last:border-b-0"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-zinc-200">{getJobTypeLabel(n.type)}</span>
                          <span className={`text-xs ${getJobStatusClassName(n.status)}`}>
                            {getJobStatusLabel(n.status)}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          {new Date(n.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-7 animate-fade-in">
          <div className="page-shell dashboard-page">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { getJobStatusLabel, getJobStatusClassName, getJobTypeLabel } from '@/app/components/JobStatusBadge';

interface Notification {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    { name: '仪表盘', href: '/dashboard', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { name: '我的小说', href: '/novels', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )},
    { name: '模板', href: '/templates', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
    { name: 'AI助手', href: '/agents', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )},
    { name: '任务队列', href: '/jobs', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    )},
    { name: '设置', href: '/settings', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { name: '管理后台', href: '/admin', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )},
  ];

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-dark-bg)] flex font-sans">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[120px] animate-float"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px] animate-float-delayed"></div>
      </div>

      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        ref={sidebarRef}
        className={`w-72 glass-panel border-r border-white/5 flex flex-col fixed top-0 left-0 h-screen z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 lg:p-8 pb-4">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform duration-300">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-tight">
              AI Writer
            </h1>
          </Link>
        </div>
        
        <div className="px-4 lg:px-6 mb-6">
          <Link href="/novels/create" className="btn-primary w-full py-3 flex items-center justify-center gap-2 group">
            <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>新建创作</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-3 lg:px-4 space-y-1.5 overflow-y-auto py-2 custom-scrollbar mb-[88px]">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${
                  isActive 
                    ? 'bg-indigo-500/10 text-white font-medium shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>}
                <span className={`relative z-10 transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-gray-500 group-hover:text-indigo-400'}`}>
                  {item.icon}
                </span>
                <span className="relative z-10">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 w-full p-4 border-t border-white/5 bg-black/20 backdrop-blur-md">
            <div className="flex items-center gap-3 px-2">
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white shadow-lg ring-2 ring-white/10">
               作者
             </div>
             <div className="flex-1 min-w-0">
               <div className="text-sm font-medium text-white truncate">写手大大</div>
               <div className="text-xs text-gray-500 truncate">author@aiwriter.com</div>
             </div>
             <button  
              onClick={handleLogout}
              className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="退出登录"
             >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
               </svg>
             </button>
           </div>
        </div>
      </aside>

      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen relative z-10 overflow-y-auto">
        <header className="h-12 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 backdrop-blur-xl bg-[#0f1117]/80 border-b border-white/5 transition-all duration-300">
           <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="text-gray-400 text-sm breadcrumbs hidden sm:flex items-center gap-2">
                <span className="text-gray-500 hover:text-gray-300 transition-colors">应用</span>
                <span className="text-gray-700">/</span>
                <span className="font-medium text-gray-200">{navItems.find(i => i.href === pathname)?.name || '仪表盘'}</span>
              </div>
           </div>
           
           <div className="flex items-center gap-3 relative" ref={notificationRef}>
             <button 
               onClick={() => setShowNotifications(!showNotifications)}
               className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors text-gray-400 hover:text-white relative"
             >
               {unreadCount > 0 && (
                 <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full ring-2 ring-[#0f1117]"></span>
               )}
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
               </svg>
             </button>
             
{showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 overflow-hidden animate-fade-in">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <h3 className="font-bold text-white">通知</h3>
                   <Link href="/jobs" className="text-xs text-indigo-400 hover:text-indigo-300">
                     查看全部
                   </Link>
                 </div>
                 <div className="max-h-80 overflow-y-auto">
                   {notifications.length === 0 ? (
                     <div className="p-6 text-center text-gray-500 text-sm">
                       暂无通知
                     </div>
                   ) : (
                     notifications.map((n) => (
                       <Link
                         key={n.id}
                         href="/jobs"
                         className="block p-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
                       >
<div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-white">{getJobTypeLabel(n.type)}</span>
                            <span className={`text-xs ${getJobStatusClassName(n.status)}`}>
                              {getJobStatusLabel(n.status)}
                            </span>
                          </div>
                         <div className="text-xs text-gray-500">
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

        <div className="p-4 lg:p-8 animate-fade-in max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

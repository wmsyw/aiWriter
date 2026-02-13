'use client';

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 1024;

export default function MobileBlocker({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      setIsChecking(false);
    };
    
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6 glass-card rounded-2xl p-8 border border-zinc-800/80">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-white">
              请使用桌面端访问
            </h1>
            <p className="text-zinc-400 leading-relaxed">
              AI Writer 是专为桌面端设计的专业创作工具，需要较大屏幕以获得最佳体验。
            </p>
          </div>
          
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              建议屏幕宽度 1024px 以上
            </div>
            
            <p className="text-xs text-zinc-600">
              请在电脑或平板横屏模式下访问
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

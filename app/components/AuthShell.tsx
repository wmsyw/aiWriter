'use client';

import { ReactNode } from 'react';

type Tone = 'emerald' | 'sky' | 'amber';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: Tone;
}

const toneMap: Record<Tone, string> = {
  emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/25',
  sky: 'from-sky-500 to-blue-500 shadow-sky-500/25',
  amber: 'from-amber-500 to-orange-500 shadow-amber-500/25',
};

export default function AuthShell({
  title,
  subtitle,
  icon,
  children,
  footer,
  tone = 'emerald',
}: AuthShellProps) {
  return (
    <div className="auth-shell">
      <div className="auth-card animate-slide-up">
        <div className="text-center mb-8">
          <div className={`w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shadow-lg ${toneMap[tone]}`}>
            {icon}
          </div>
          <h1 className="text-3xl font-bold mb-2 text-zinc-100">{title}</h1>
          {subtitle && <p className="text-zinc-400">{subtitle}</p>}
        </div>

        {children}

        {footer && (
          <div className="mt-7 text-center text-sm text-zinc-400">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

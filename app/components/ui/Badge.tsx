'use client';

import * as React from 'react';
import { cn } from '@/app/lib/utils';
import { motion, HTMLMotionProps } from 'framer-motion';

export interface BadgeProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'queued' | 'running' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', animated, children, ...props }, ref) => {
    const variants = {
      default: 'border-transparent bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border-indigo-500/20',
      success: 'border-transparent bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20',
      warning: 'border-transparent bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20',
      error: 'border-transparent bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/20',
      info: 'border-transparent bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border-cyan-500/20',
      queued: 'border-transparent bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 border-slate-500/20',
      running: 'border-transparent bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse',
      outline: 'text-gray-300 border-white/20',
    };

    const sizes = {
      sm: 'text-[10px] px-1.5 py-0.5 h-5',
      md: 'text-xs px-2.5 py-0.5 h-6',
      lg: 'text-sm px-3 py-1 h-7',
    };

    const Comp = animated ? motion.div : 'div';

    return (
      <motion.div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          variants[variant],
          sizes[size],
          className
        )}
        {...(animated ? {
          initial: { scale: 0.9, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          transition: { type: 'spring', stiffness: 500, damping: 30 }
        } : {})}
        {...props}
      >
        {variant === 'running' && (
          <span className="mr-1.5 flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
        )}
        {children}
      </motion.div>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };

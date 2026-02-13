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
      default: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
      success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      error: 'bg-red-500/15 text-red-400 border-red-500/30',
      info: 'bg-blue-500/15 text-sky-300 border-blue-500/30',
      queued: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
      running: 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse',
      outline: 'text-zinc-300 border-zinc-700/80 bg-transparent',
    };

    const sizes = {
      sm: 'text-[10px] px-1.5 py-0.5 h-5',
      md: 'text-xs px-2.5 py-0.5 h-6',
      lg: 'text-sm px-3 py-1 h-7',
    };

    return (
      <motion.div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border font-medium tracking-wide transition-colors',
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
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
        )}
        {children}
      </motion.div>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };

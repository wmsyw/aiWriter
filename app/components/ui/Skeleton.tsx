'use client';

import * as React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/app/lib/utils';
import { shimmer } from '@/app/lib/animations';

export interface SkeletonProps extends HTMLMotionProps<'div'> {
  variant?: 'text' | 'circle' | 'rect';
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'text', ...props }, ref) => {
    const variants = {
      text: 'h-4 w-full rounded',
      circle: 'h-10 w-10 rounded-full',
      rect: 'h-full w-full rounded-md',
    };

    return (
      <motion.div
        ref={ref}
        className={cn(
          'bg-zinc-800/40 relative overflow-hidden',
          variants[variant],
          className
        )}
        variants={shimmer}
        animate="animate"
        style={{
          background: 'linear-gradient(90deg, rgba(63,63,70,0.35) 25%, rgba(113,113,122,0.55) 50%, rgba(63,63,70,0.35) 75%)',
          backgroundSize: '200% 100%',
        }}
        {...props}
      />
    );
  }
);
Skeleton.displayName = 'Skeleton';

export { Skeleton };

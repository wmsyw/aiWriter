'use client';

import type React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { cn } from '@/app/lib/utils';
import { pageTransition, pageTransitionReduced } from '@/app/lib/animations';

interface PageTransitionProps {
  children: React.ReactNode;
  wrapperClassName?: string;
  pageClassName?: string;
  mode?: 'wait' | 'sync' | 'popLayout';
}

export default function PageTransition({
  children,
  wrapperClassName,
  pageClassName,
  mode = 'wait',
}: PageTransitionProps) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? pageTransitionReduced : pageTransition;

  return (
    <div className={cn('relative', wrapperClassName)}>
      <AnimatePresence mode={mode} initial={false}>
        <motion.div
          key={pathname}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn('h-full', pageClassName)}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

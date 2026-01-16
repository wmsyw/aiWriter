'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { motion } from 'framer-motion';
import { cn } from '@/app/lib/utils';
import { progressBar } from '@/app/lib/animations';

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    label?: string;
    showValue?: boolean;
  }
>(({ className, value, indicatorClassName, label, showValue, ...props }, ref) => (
  <div className="w-full space-y-2">
    {(label || showValue) && (
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        {label && <span>{label}</span>}
        {showValue && <span>{Math.round(value || 0)}%</span>}
      </div>
    )}
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-black/20',
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        asChild
        className={cn(
          'h-full w-full flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all',
          indicatorClassName
        )}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value || 0}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  </div>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

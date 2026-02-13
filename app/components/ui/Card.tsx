'use client';

import * as React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/app/lib/utils';
import { cardHover } from '@/app/lib/animations';

export interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'interactive' | 'outline';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const isInteractive = variant === 'interactive';
    const variantClass =
      variant === 'outline'
        ? 'border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-sm'
        : 'glass-card';
    
    return (
      <motion.div
        ref={ref}
        className={cn(
          'rounded-xl overflow-hidden',
          'focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:ring-offset-2 focus-within:ring-offset-zinc-950',
          variantClass,
          className
        )}
        variants={isInteractive ? cardHover : undefined}
        initial={isInteractive ? "rest" : undefined}
        whileHover={isInteractive ? "hover" : undefined}
        whileTap={isInteractive ? "tap" : undefined}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-2 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-snug tracking-tight text-white',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm leading-relaxed text-zinc-400', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

'use client';

import { ReactNode, forwardRef, HTMLAttributes } from 'react';

type GlassCardVariant = 'default' | 'interactive' | 'dashed';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: GlassCardVariant;
  hover?: boolean;
  rounded?: 'lg' | 'xl' | '2xl';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const ROUNDED_CLASSES = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

const PADDING_CLASSES = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const VARIANT_CLASSES: Record<GlassCardVariant, string> = {
  default: 'glass-card',
  interactive: 'glass-card hover:border-indigo-500/30 cursor-pointer',
  dashed: 'glass-card border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5',
};

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      variant = 'default',
      hover = false,
      rounded = '2xl',
      padding = 'md',
      className = '',
      ...props
    },
    ref
  ) => {
    const hoverClass = hover ? 'transition-all duration-300 group' : '';

    return (
      <div
        ref={ref}
        className={`${VARIANT_CLASSES[variant]} ${ROUNDED_CLASSES[rounded]} ${PADDING_CLASSES[padding]} ${hoverClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;

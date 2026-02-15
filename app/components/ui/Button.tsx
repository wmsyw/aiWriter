'use client';

import * as React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/app/lib/utils';
import { buttonHover } from '@/app/lib/animations';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading,
      loadingText,
      leftIcon,
      rightIcon,
      children,
      disabled,
      fullWidth,
      ...props
    },
    ref
  ) => {
    
    const variants = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
      ai: 'btn-ai',
    };

    const sizes = {
      sm: 'h-9 px-3.5 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-6 text-base',
    };

    const iconSizes = {
      sm: 'text-base [&>svg]:h-4 [&>svg]:w-4',
      md: 'text-base [&>svg]:h-4 [&>svg]:w-4',
      lg: 'text-lg [&>svg]:h-5 [&>svg]:w-5',
    };

    const loadingSizes = {
      sm: 'h-4 w-4',
      md: 'h-4 w-4',
      lg: 'h-5 w-5',
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap leading-none gap-1.5 font-medium rounded-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
          'disabled:opacity-50 disabled:pointer-events-none',
          fullWidth && 'w-full',
          variants[variant],
          sizes[size],
          className
        )}
        variants={buttonHover}
        initial="rest"
        whileHover={!disabled && !isLoading ? "hover" : "rest"}
        whileTap={!disabled && !isLoading ? "tap" : "rest"}
        disabled={disabled || isLoading}
        aria-disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        data-loading={isLoading ? 'true' : 'false'}
        data-variant={variant}
        {...props}
      >
        {isLoading && (
          <svg className={cn('animate-spin', loadingSizes[size])} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {!isLoading && leftIcon && (
          <span className={cn('shrink-0 inline-flex items-center justify-center leading-none', iconSizes[size])}>
            {leftIcon}
          </span>
        )}
        {!isLoading && children}
        {!isLoading && rightIcon && (
          <span className={cn('shrink-0 inline-flex items-center justify-center leading-none', iconSizes[size])}>
            {rightIcon}
          </span>
        )}
        {isLoading && <span>{loadingText ?? children}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export { Button };

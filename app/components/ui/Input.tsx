'use client';

import * as React from 'react';
import { cn } from '@/app/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  showRequired?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      id,
      showRequired,
      required,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    const inputId = id || React.useId();
    const helperId = helperText ? `${inputId}-helper` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [ariaDescribedBy, errorId || helperId].filter(Boolean).join(' ') || undefined;
    const invalid = typeof ariaInvalid === 'boolean' ? ariaInvalid : Boolean(error);

    return (
      <div className="w-full space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-300"
          >
            {label}
            {showRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative group">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-500 transition-colors">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            className={cn(
              'flex h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 text-sm text-zinc-100',
              'placeholder:text-zinc-500',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/35 focus-visible:border-emerald-500/55',
              'hover:border-zinc-700/90 transition-all duration-200',
              'disabled:cursor-not-allowed disabled:opacity-50',
              !!leftIcon && 'pl-10',
              !!rightIcon && 'pr-10',
              invalid && 'border-red-500/50 focus-visible:ring-red-500/30',
              className
            )}
            ref={ref}
            required={required}
            aria-required={showRequired || required || undefined}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-500 transition-colors">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p id={errorId} className="text-xs text-red-400 animate-slide-up">{error}</p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-zinc-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  showRequired?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      label,
      helperText,
      error,
      id,
      showRequired,
      required,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    const inputId = id || React.useId();
    const helperId = helperText ? `${inputId}-helper` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [ariaDescribedBy, errorId || helperId].filter(Boolean).join(' ') || undefined;
    const invalid = typeof ariaInvalid === 'boolean' ? ariaInvalid : Boolean(error);

    return (
      <div className="w-full space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-300"
          >
            {label}
            {showRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          id={inputId}
          className={cn(
            'flex min-h-[96px] w-full rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 text-sm text-zinc-100',
            'placeholder:text-zinc-500',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/35 focus-visible:border-emerald-500/55',
            'hover:border-zinc-700/90 transition-all duration-200',
            'disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-red-500/50 focus-visible:ring-red-500/30',
            className
          )}
          ref={ref}
          required={required}
          aria-required={showRequired || required || undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...props}
        />
        {error ? (
          <p id={errorId} className="text-xs text-red-400 animate-slide-up">{error}</p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-zinc-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export { Input, Textarea };

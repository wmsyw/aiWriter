'use client';

import * as React from 'react';
import { cn } from '@/app/lib/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, error, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    const invalid = typeof ariaInvalid === 'boolean' ? ariaInvalid : Boolean(error);

    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded border border-zinc-600 bg-zinc-900 text-emerald-500 accent-emerald-500',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid && 'border-red-500/60 focus-visible:ring-red-500/40',
          className
        )}
        aria-invalid={invalid}
        {...props}
      />
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };

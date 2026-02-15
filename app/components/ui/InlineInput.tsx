'use client';

import * as React from 'react';
import { cn } from '@/app/lib/utils';

export interface InlineInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const InlineInput = React.forwardRef<HTMLInputElement, InlineInputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full border-none bg-transparent p-0 text-sm text-zinc-100 outline-none',
        'placeholder:text-zinc-500 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    />
  )
);

InlineInput.displayName = 'InlineInput';

export { InlineInput };

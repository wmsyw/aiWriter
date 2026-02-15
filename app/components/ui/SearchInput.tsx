'use client';

import * as React from 'react';
import { Input, type InputProps } from './Input';

export interface SearchInputProps extends Omit<InputProps, 'type' | 'leftIcon' | 'rightIcon'> {
  onClear?: () => void;
  clearLabel?: string;
  clearOnEscape?: boolean;
}

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const ClearIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onClear,
      clearLabel = '清空搜索',
      clearOnEscape = true,
      onKeyDown,
      className,
      ...props
    },
    ref
  ) => {
    const hasValue =
      value !== undefined &&
      value !== null &&
      String(value).length > 0;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (
        !event.defaultPrevented &&
        clearOnEscape &&
        event.key === 'Escape' &&
        hasValue &&
        !props.disabled &&
        onClear
      ) {
        event.preventDefault();
        onClear();
      }
    };

    return (
      <Input
        ref={ref}
        type="text"
        value={value}
        onKeyDown={handleKeyDown}
        className={className}
        leftIcon={<SearchIcon />}
        rightIcon={
          hasValue && onClear ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClear}
              className="rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label={clearLabel}
            >
              <ClearIcon />
            </button>
          ) : undefined
        }
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput };

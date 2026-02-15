'use client';

import * as React from 'react';
import { cn } from '@/app/lib/utils';

export interface RangeSliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  helperText?: string;
  error?: string;
  valueFormatter?: (value: number) => string;
  showValue?: boolean;
}

const RangeSlider = React.forwardRef<HTMLInputElement, RangeSliderProps>(
  (
    {
      className,
      label,
      helperText,
      error,
      id,
      value,
      defaultValue,
      min,
      valueFormatter,
      showValue = true,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || React.useId();
    const numericValue = Number(value ?? defaultValue ?? min ?? 0);
    const displayValue = Number.isFinite(numericValue)
      ? (valueFormatter ? valueFormatter(numericValue) : String(numericValue))
      : '';

    return (
      <div className="w-full space-y-2">
        {(label || showValue) && (
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
            {label ? (
              <label htmlFor={inputId} className={cn(disabled && 'opacity-60')}>
                {label}
              </label>
            ) : (
              <span />
            )}
            {showValue && <span className="font-mono text-zinc-300">{displayValue}</span>}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type="range"
          value={value}
          defaultValue={defaultValue}
          min={min}
          disabled={disabled}
          className={cn(
            'range-slider w-full',
            disabled && 'cursor-not-allowed opacity-50',
            error && 'ring-1 ring-red-500/30',
            className
          )}
          aria-label={props['aria-label'] || label}
          aria-invalid={Boolean(error)}
          {...props}
        />

        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-zinc-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

RangeSlider.displayName = 'RangeSlider';

export { RangeSlider };

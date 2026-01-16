'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/app/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'glass-input w-full px-4 py-2 flex justify-between items-center cursor-pointer',
      'hover:border-white/30 transition-colors text-left',
      'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=open]:border-indigo-500/50 data-[state=open]:ring-1 data-[state=open]:ring-indigo-500/50 data-[state=open]:bg-black/30',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <svg
        className="w-4 h-4 text-gray-400 transition-transform duration-200 ml-2 flex-shrink-0 data-[state=open]:rotate-180"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-60 min-w-[8rem] overflow-hidden',
        'glass-panel rounded-xl shadow-2xl border border-white/10',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-lg',
      'px-4 py-2.5 text-sm outline-none transition-all duration-150',
      'text-gray-300 hover:bg-white/10 hover:text-white hover:pl-5',
      'focus:bg-white/10 focus:text-white focus:pl-5',
      'data-[state=checked]:bg-indigo-500/20 data-[state=checked]:text-indigo-300 data-[state=checked]:font-medium',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center justify-center">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export function Select({ 
  label, 
  value, 
  onChange, 
  options, 
  placeholder = '请选择...', 
  className = '',
  disabled = false 
}: SelectProps) {
  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label || placeholder}>
          <SelectPrimitive.Value placeholder={placeholder}>
            <span className={selectedOption ? 'text-white' : 'text-gray-500'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </SelectPrimitive.Value>
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">无选项</div>
          ) : (
            options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </SelectPrimitive.Root>
    </div>
  );
}

export { SelectTrigger, SelectContent, SelectItem };

'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/app/lib/utils';

interface Option {
  value: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
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
      'glass-input w-full px-4 py-2.5 flex justify-between items-center cursor-pointer',
      'hover:border-zinc-500/50 hover:bg-zinc-800/30 transition-all duration-300',
      'focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=open]:border-emerald-500/50 data-[state=open]:ring-2 data-[state=open]:ring-emerald-500/20 data-[state=open]:bg-zinc-900/80',
      'group',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <svg
        className="w-4 h-4 text-zinc-500 transition-transform duration-300 ease-in-out group-data-[state=open]:rotate-180 group-data-[state=open]:text-emerald-500"
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
        'relative z-50 max-h-[300px] min-w-[8rem] overflow-hidden',
        'bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/50 rounded-xl shadow-2xl shadow-black/50',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' && 'data-[side=bottom]:translate-y-2 data-[side=top]:-translate-y-2',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1 text-zinc-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport
        className={cn(
          'p-1.5 custom-scrollbar',
          position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1 text-zinc-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectGroup = SelectPrimitive.Group

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-zinc-800", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { icon?: React.ReactNode }
>(({ className, children, icon, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-lg',
      'px-3 py-2.5 text-sm outline-none transition-all duration-200',
      'text-zinc-400',
      'focus:bg-zinc-800/80 focus:text-zinc-100 focus:translate-x-1',
      'data-[state=checked]:bg-emerald-500/10 data-[state=checked]:text-emerald-400 data-[state=checked]:font-medium',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-2 flex-1">
        {icon && <span className="text-zinc-500 group-focus:text-zinc-300">{icon}</span>}
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </div>
    
    <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center justify-center animate-in fade-in zoom-in-50 duration-200">
      <svg className="w-4 h-4 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
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
  const validOptions = options.filter(opt => opt.value !== '');
  const selectedOption = validOptions.find(opt => opt.value === value);

  const hasGroups = validOptions.some(opt => opt.group);
  
  const content = React.useMemo(() => {
    if (!hasGroups) {
      return validOptions.map((option) => (
        <SelectItem key={option.value} value={option.value} icon={option.icon}>
          {option.label}
        </SelectItem>
      ));
    }

    const groups: Record<string, Option[]> = {};
    const noGroup: Option[] = [];

    validOptions.forEach(opt => {
      if (opt.group) {
        if (!groups[opt.group]) groups[opt.group] = [];
        groups[opt.group].push(opt);
      } else {
        noGroup.push(opt);
      }
    });

    return (
      <>
        {noGroup.map(opt => (
          <SelectItem key={opt.value} value={opt.value} icon={opt.icon}>{opt.label}</SelectItem>
        ))}
        {noGroup.length > 0 && Object.keys(groups).length > 0 && <SelectSeparator />}
        {Object.entries(groups).map(([groupName, groupOptions], index) => (
          <SelectGroup key={groupName}>
            <SelectLabel>{groupName}</SelectLabel>
            {groupOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value} icon={opt.icon}>{opt.label}</SelectItem>
            ))}
            {index < Object.keys(groups).length - 1 && <SelectSeparator />}
          </SelectGroup>
        ))}
      </>
    );
  }, [validOptions, hasGroups]);

  return (
    <div className={cn('relative group/select', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-400 mb-2 group-hover/select:text-gray-300 transition-colors">
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label || placeholder}>
          <SelectPrimitive.Value placeholder={placeholder}>
            <span className={cn("transition-colors", selectedOption ? 'text-zinc-100' : 'text-zinc-500')}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </SelectPrimitive.Value>
        </SelectTrigger>
        <SelectContent>
          {validOptions.length === 0 ? (
            <div className="px-4 py-8 text-sm text-zinc-500 text-center italic flex flex-col items-center gap-2">
                <span className="opacity-50">无可用选项</span>
            </div>
          ) : content}
        </SelectContent>
      </SelectPrimitive.Root>
    </div>
  );
}

export { SelectTrigger, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator };

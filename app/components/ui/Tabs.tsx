'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/app/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: 'underline' | 'pills' | 'boxed';
  }
>(({ className, variant = 'underline', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center justify-start',
      variant === 'pills' && 'bg-zinc-900/70 border border-zinc-800/70 p-1 rounded-xl gap-1',
      variant === 'boxed' && 'w-full border-b border-zinc-800/80',
      variant === 'underline' && 'w-full border-b border-zinc-800/80 gap-2 md:gap-4',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: 'underline' | 'pills' | 'boxed';
  }
>(({ className, children, variant = 'underline', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
      'disabled:pointer-events-none disabled:opacity-50',
      variant === 'pills' && 'rounded-lg text-zinc-400 data-[state=active]:bg-emerald-500 data-[state=active]:text-white hover:text-zinc-100',
      variant === 'boxed' && 'border-b-2 border-transparent text-zinc-400 data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-300 hover:text-zinc-100',
      variant === 'underline' && 'pb-3 text-zinc-400 hover:text-zinc-100 data-[state=active]:text-emerald-300 after:absolute after:left-2 after:right-2 after:-bottom-px after:h-[2px] after:rounded-full after:bg-emerald-500 after:scale-x-0 after:transition-transform after:duration-200 data-[state=active]:after:scale-x-100',
      className
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 animate-fade-in',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

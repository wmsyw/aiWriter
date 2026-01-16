'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';
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
      variant === 'pills' && 'bg-black/20 p-1 rounded-xl gap-1',
      variant === 'boxed' && 'w-full border-b border-white/10',
      variant === 'underline' && 'w-full border-b border-white/10 gap-6',
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
      'relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      variant === 'pills' && 'rounded-lg text-gray-400 data-[state=active]:bg-indigo-500 data-[state=active]:text-white hover:text-white',
      variant === 'boxed' && 'border-b-2 border-transparent text-gray-400 data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-400 hover:text-white',
      variant === 'underline' && 'pb-3 text-gray-400 hover:text-white data-[state=active]:text-indigo-400',
      className
    )}
    {...props}
  >
    {children}
    {variant === 'underline' && (
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 scale-x-0 transition-transform origin-left data-[state=active]:scale-x-100"
        layoutId="activeTab"
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    )}
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
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

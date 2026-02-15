'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/app/lib/utils';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

interface ToastInput {
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, 'description' | 'variant' | 'duration'>> {
  id: string;
  title?: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const TOAST_DURATION_DEFAULT = 3200;
const TOAST_MAX_COUNT = 5;

let toastSequence = 0;

const ToastContext = React.createContext<ToastContextValue | null>(null);

function createToastId(): string {
  toastSequence += 1;
  return `toast-${Date.now()}-${toastSequence}`;
}

const VARIANT_STYLE: Record<ToastVariant, { tone: string; icon: React.ReactNode; progress: string }> = {
  success: {
    tone: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-100',
    progress: 'bg-emerald-400',
    icon: (
      <svg className="h-4 w-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  info: {
    tone: 'border-sky-500/35 bg-sky-500/12 text-sky-100',
    progress: 'bg-sky-400',
    icon: (
      <svg className="h-4 w-4 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    tone: 'border-amber-500/35 bg-amber-500/12 text-amber-100',
    progress: 'bg-amber-400',
    icon: (
      <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M10.29 3.86l-7.2 12.48A2 2 0 004.82 19.5h14.36a2 2 0 001.73-3.16l-7.2-12.48a2 2 0 00-3.46 0z" />
      </svg>
    ),
  },
  error: {
    tone: 'border-red-500/35 bg-red-500/12 text-red-100',
    progress: 'bg-red-400',
    icon: (
      <svg className="h-4 w-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const timerMapRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const dismissToast = React.useCallback((id: string) => {
    const timer = timerMapRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timerMapRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((input: ToastInput) => {
    const id = createToastId();
    const record: ToastRecord = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant || 'info',
      duration: Math.max(1200, input.duration || TOAST_DURATION_DEFAULT),
    };

    setToasts((prev) => {
      const next = [...prev, record];
      if (next.length <= TOAST_MAX_COUNT) return next;
      const removed = next.shift();
      if (removed) {
        const timer = timerMapRef.current.get(removed.id);
        if (timer) {
          window.clearTimeout(timer);
          timerMapRef.current.delete(removed.id);
        }
      }
      return next;
    });

    const timer = window.setTimeout(() => {
      dismissToast(id);
    }, record.duration);
    timerMapRef.current.set(id, timer);

    return id;
  }, [dismissToast]);

  const clearToasts = React.useCallback(() => {
    timerMapRef.current.forEach((timer) => window.clearTimeout(timer));
    timerMapRef.current.clear();
    setToasts([]);
  }, []);

  React.useEffect(() => {
    return () => {
      timerMapRef.current.forEach((timer) => window.clearTimeout(timer));
      timerMapRef.current.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      dismissToast,
      clearToasts,
    }),
    [toast, dismissToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed right-4 top-4 z-[500] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {toasts.map((item) => {
                const style = VARIANT_STYLE[item.variant];
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      'pointer-events-auto overflow-hidden rounded-xl border shadow-xl shadow-black/35 backdrop-blur-md',
                      style.tone
                    )}
                    role={item.variant === 'error' ? 'alert' : 'status'}
                  >
                    <div className="flex items-start gap-2 px-3.5 py-3">
                      <div className="mt-0.5 shrink-0">{style.icon}</div>
                      <div className="min-w-0 flex-1">
                        {item.title && <div className="text-sm font-semibold text-zinc-100">{item.title}</div>}
                        <div className="text-sm leading-relaxed text-zinc-200">{item.description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissToast(item.id)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                        aria-label="关闭通知"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="h-0.5 w-full bg-white/10">
                      <motion.div
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: item.duration / 1000, ease: 'linear' }}
                        className={cn('h-full', style.progress)}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

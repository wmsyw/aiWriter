'use client';

import { ReactNode, useEffect, useCallback, useState, HTMLAttributes, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Input } from './Input';
import { cn } from '@/app/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  requireConfirmation?: string;
}

interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let activeModalCount = 0;

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'lg',
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = '',
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  useEffect(() => {
    if (!isOpen) return;

    activeModalCount += 1;
    document.body.style.overflow = 'hidden';
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable || panel).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      handleEscape(event);

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

      if (focusableElements.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      activeModalCount = Math.max(0, activeModalCount - 1);
      if (activeModalCount === 0) {
        document.body.style.overflow = '';
      }
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, handleEscape]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div
        className="absolute inset-0 bg-black/72 backdrop-blur-lg animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        className={`w-full ${SIZE_CLASSES[size]} relative z-10 animate-slide-up max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[26px] border border-white/10 bg-[#0d111a]/96 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-500/14 via-sky-500/8 to-transparent px-6 py-4">
            {title && (
              <h2 id={titleId} className="text-xl font-bold text-white">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-0 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                aria-label="Close modal"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export function ModalFooter({ className, ...props }: ModalFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4',
        '[&>.inline-flex]:h-9 [&>.inline-flex]:min-w-[88px] [&>.inline-flex]:px-5 [&>.inline-flex]:text-xs',
        '[&>.inline-flex_svg]:h-4 [&>.inline-flex_svg]:w-4',
        className
      )}
      {...props}
    />
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'warning',
  requireConfirmation,
}: ConfirmModalProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isConfirmDisabled = requireConfirmation ? confirmInput !== requireConfirmation : false;

  useEffect(() => {
    if (!isOpen) {
      setConfirmInput('');
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Confirm action failed:', error);
      // We still close on error because the parent usually handles error notification (toast)
      // and we don't want to leave the modal in a stuck state or retry loop without explicit user action
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const variantStyles = {
    danger: {
      iconClass: 'text-red-400 bg-red-500/10 border-red-500/20',
      confirmClass: 'border-red-500/35 bg-red-500/20 text-red-100 hover:bg-red-500/30',
      borderClass: 'border-red-500/30',
    },
    warning: {
      iconClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      confirmClass: 'border-amber-500/35 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30',
      borderClass: 'border-amber-500/30',
    },
    info: {
      iconClass: 'text-sky-400 bg-blue-500/10 border-blue-500/20',
      confirmClass: 'border-blue-500/35 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30',
      borderClass: 'border-blue-500/30',
    },
  };

  const styles = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" title="" showCloseButton={false}>
      <div className="space-y-4">
        <div className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${styles.iconClass}`}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.29 3.86l-7.2 12.48A2 2 0 004.82 19.5h14.36a2 2 0 001.73-3.16l-7.2-12.48a2 2 0 00-3.46 0z" />
          </svg>
        </div>
        <h3 className="text-center text-lg font-bold text-white">{title}</h3>
        <p className="whitespace-pre-line break-words text-left text-sm leading-6 text-zinc-300">
          {message}
        </p>
        
        {requireConfirmation && (
          <div className="space-y-2 text-left">
            <p className="text-xs text-zinc-500">
              请输入 <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300">{requireConfirmation}</code> 以确认
            </p>
            <Input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className={cn(
                'h-10 rounded-lg border bg-zinc-950/60 text-center text-white',
                styles.borderClass
              )}
              placeholder={requireConfirmation}
              disabled={isLoading}
              aria-label="确认输入"
            />
          </div>
        )}
        
        <ModalFooter className="justify-center border-t-0 pt-2 [&>.inline-flex]:min-w-[96px]">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant="secondary"
            onClick={handleConfirm}
            isLoading={isLoading}
            loadingText="处理中..."
            disabled={isConfirmDisabled || isLoading}
            size="sm"
            className={`min-w-[96px] border ${styles.confirmClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {confirmText}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

'use client';

import { ReactNode, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

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

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

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
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        className={`glass-card w-full ${SIZE_CLASSES[size]} rounded-2xl relative z-10 animate-slide-up max-h-[90vh] overflow-y-auto custom-scrollbar ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-6 border-b border-zinc-800/80">
            {title && (
              <h2 id="modal-title" className="text-xl font-bold text-white">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all ml-auto"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      buttonClass: 'bg-red-600 hover:bg-red-500 text-white',
      borderClass: 'border-red-500/30',
    },
    warning: {
      iconClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
      borderClass: 'border-amber-500/30',
    },
    info: {
      iconClass: 'text-sky-400 bg-blue-500/10 border-blue-500/20',
      buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white',
      borderClass: 'border-blue-500/30',
    },
  };

  const styles = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="">
      <div className="text-center space-y-4">
        <div className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${styles.iconClass}`}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.29 3.86l-7.2 12.48A2 2 0 004.82 19.5h14.36a2 2 0 001.73-3.16l-7.2-12.48a2 2 0 00-3.46 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-zinc-400 text-sm">{message}</p>
        
        {requireConfirmation && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              请输入 <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300">{requireConfirmation}</code> 以确认
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className={`w-full px-3 py-2 bg-zinc-950/60 border rounded-lg text-center text-white focus:outline-none focus:ring-2 ${styles.borderClass}`}
              placeholder={requireConfirmation}
              disabled={isLoading}
            />
          </div>
        )}
        
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled || isLoading}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${styles.buttonClass} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[80px]`}
          >
            {isLoading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

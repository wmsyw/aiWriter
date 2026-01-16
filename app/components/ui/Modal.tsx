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
  onConfirm: () => void;
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
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            {title && (
              <h2 id="modal-title" className="text-xl font-bold text-white">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all ml-auto"
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
  const isConfirmDisabled = requireConfirmation ? confirmInput !== requireConfirmation : false;

  useEffect(() => {
    if (!isOpen) {
      setConfirmInput('');
    }
  }, [isOpen]);

  const variantStyles = {
    danger: {
      icon: '⚠️',
      buttonClass: 'bg-red-600 hover:bg-red-700',
      borderClass: 'border-red-500/30',
    },
    warning: {
      icon: '⚡',
      buttonClass: 'bg-amber-600 hover:bg-amber-700',
      borderClass: 'border-amber-500/30',
    },
    info: {
      icon: 'ℹ️',
      buttonClass: 'bg-blue-600 hover:bg-blue-700',
      borderClass: 'border-blue-500/30',
    },
  };

  const styles = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="">
      <div className="text-center space-y-4">
        <div className="text-4xl">{styles.icon}</div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-gray-400 text-sm">{message}</p>
        
        {requireConfirmation && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              请输入 <code className="bg-white/10 px-1 py-0.5 rounded text-amber-400">{requireConfirmation}</code> 以确认
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className={`w-full px-3 py-2 bg-black/30 border rounded-lg text-center text-white focus:outline-none focus:ring-2 ${styles.borderClass}`}
              placeholder={requireConfirmation}
            />
          </div>
        )}
        
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            disabled={isConfirmDisabled}
            className={`px-4 py-2 rounded-lg text-white font-medium transition-all ${styles.buttonClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

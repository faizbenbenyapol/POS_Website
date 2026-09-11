'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircleIcon, AlertCircleIcon, AlertTriangleIcon, InfoIcon, CloseIcon } from '@/components/Icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastMessage = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
};

type ToastContextValue = {
  toast: (options: { type?: ToastType; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type = 'info', title, description }: { type?: ToastType; title: string; description?: string }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);

      // Auto dismiss after 3.5 seconds
      setTimeout(() => {
        removeToast(id);
      }, 3500);
    },
    [removeToast]
  );

  const value: ToastContextValue = {
    toast: addToast,
    success: (title, description) => addToast({ type: 'success', title, description }),
    error: (title, description) => addToast({ type: 'error', title, description }),
    warning: (title, description) => addToast({ type: 'warning', title, description }),
    info: (title, description) => addToast({ type: 'info', title, description }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast Container — Fixed Bottom-Right, unobtrusive, high-contrast commercial design */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2.5 p-4 sm:p-6"
      >
        {toasts.map((t) => {
          const icon =
            t.type === 'success' ? (
              <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : t.type === 'error' ? (
              <AlertCircleIcon className="h-5 w-5 shrink-0 text-red-600" />
            ) : t.type === 'warning' ? (
              <AlertTriangleIcon className="h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <InfoIcon className="h-5 w-5 shrink-0 text-slate-600" />
            );

          const borderClass =
            t.type === 'success'
              ? 'border-emerald-200 bg-white'
              : t.type === 'error'
              ? 'border-red-200 bg-white'
              : t.type === 'warning'
              ? 'border-amber-200 bg-white'
              : 'border-slate-200 bg-white';

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all animate-in slide-in-from-bottom-5 duration-200 ${borderClass}`}
            >
              {icon}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 leading-tight">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="ปิดแจ้งเตือน"
                className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 cursor-pointer"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if rendered outside ToastProvider
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    };
  }
  return context;
}

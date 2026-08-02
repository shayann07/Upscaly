import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Warning, XCircle, Info, X } from '@phosphor-icons/react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  onAutoFix?: () => void;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none select-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="pointer-events-auto p-4 rounded-3xl liquid-glass border border-[#D2C3F6]/30 shadow-2xl backdrop-blur-2xl flex gap-3.5 relative overflow-hidden"
            style={{
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(210, 195, 246, 0.15)',
            }}
          >
            {/* Ambient Type Glow */}
            <div
              className={`absolute -left-12 -top-12 w-24 h-24 rounded-full blur-xl pointer-events-none opacity-30 ${
                toast.type === 'success'
                  ? 'bg-emerald-400'
                  : toast.type === 'error'
                  ? 'bg-rose-500'
                  : toast.type === 'warning'
                  ? 'bg-amber-400'
                  : 'bg-indigo-400'
              }`}
            />

            {/* Icon Column */}
            <div className="pt-0.5 shrink-0 relative z-10">
              {toast.type === 'success' && <CheckCircle size={22} className="text-emerald-400 drop-shadow" weight="fill" />}
              {toast.type === 'error' && <XCircle size={22} className="text-rose-400 drop-shadow" weight="fill" />}
              {toast.type === 'warning' && <Warning size={22} className="text-amber-400 drop-shadow" weight="fill" />}
              {toast.type === 'info' && <Info size={22} className="text-indigo-400 drop-shadow" weight="fill" />}
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0 pr-4 relative z-10">
              <p className="text-xs font-extrabold text-[#F1FEC8] leading-tight drop-shadow-sm">{toast.message}</p>
              {toast.suggestion && (
                <p className="text-[11px] text-[#D2C3F6]/80 mt-1 leading-snug font-medium">{toast.suggestion}</p>
              )}
              {toast.onAutoFix && (
                <button
                  type="button"
                  onClick={toast.onAutoFix}
                  className="mt-2 text-[10px] font-extrabold px-3 py-1 rounded-xl bg-gradient-to-r from-[#36255C] to-[#4A3078] text-[#F1FEC8] border border-[#D2C3F6]/40 hover:scale-105 transition-all shadow cursor-pointer"
                >
                  Auto-Fix Issue
                </button>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="absolute top-3.5 right-3.5 text-[#D2C3F6]/60 hover:text-[#F1FEC8] transition-colors cursor-pointer relative z-10"
            >
              <X size={14} weight="bold" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

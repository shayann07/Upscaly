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
            className="pointer-events-auto p-4 rounded-2xl liquid-glass border border-[#D2C3F6]/20 shadow-2xl flex gap-3 relative overflow-hidden"
          >
            {/* Icon Column */}
            <div className="pt-0.5">
              {toast.type === 'success' && <CheckCircle size={20} className="text-green-400" weight="fill" />}
              {toast.type === 'error' && <XCircle size={20} className="text-red-400" weight="fill" />}
              {toast.type === 'warning' && <Warning size={20} className="text-yellow-400" weight="fill" />}
              {toast.type === 'info' && <Info size={20} className="text-blue-400" weight="fill" />}
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-xs font-bold text-[#F1FEC8] leading-tight">{toast.message}</p>
              {toast.suggestion && (
                <p className="text-[11px] text-[#D2C3F6]/80 mt-1 leading-snug">{toast.suggestion}</p>
              )}
              {toast.onAutoFix && (
                <button
                  onClick={toast.onAutoFix}
                  className="mt-2 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#36255C] text-[#F1FEC8] border border-[#D2C3F6]/30 hover:bg-[#4A3078] transition-colors"
                >
                  Auto-Fix Issue
                </button>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={() => onDismiss(toast.id)}
              className="absolute top-3 right-3 text-[#D2C3F6]/60 hover:text-[#F1FEC8] transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

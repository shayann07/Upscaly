import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmCancelDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmCancelDialog({
  isOpen,
  title = 'Cancel Active Upscale?',
  message = 'An upscaling job is currently in progress. Removing this file will terminate the background engine and release all GPU VRAM resources.',
  confirmText = 'Cancel & Free GPU',
  cancelText = 'Keep Running',
  onConfirm,
  onDismiss,
}: ConfirmCancelDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Dialog Window */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-[420px] max-w-[90vw] p-6 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(18,17,16,0.96)] shadow-2xl backdrop-blur-xl select-none"
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--danger-bg)] border border-[var(--border-danger)] text-[var(--danger-text)]">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="font-['Archivo',sans-serif] text-base font-semibold text-[var(--text-primary)]">
                {title}
              </h3>
            </div>

            {/* Description */}
            <p className="text-xs leading-relaxed text-[var(--text-dim)] mb-6 font-['Archivo',sans-serif]">
              {message}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border-default)] bg-[var(--bg-glass-subtle)] text-[var(--text-primary)] transition-all duration-150 hover:bg-[var(--border-default)] cursor-pointer"
              >
                {cancelText}
              </button>

              <button
                type="button"
                onClick={onConfirm}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border-danger)] bg-[var(--danger-bg)] text-[var(--danger-text)] transition-all duration-150 hover:bg-[var(--danger-hover)] hover:text-[#F2C4BE] shadow-lg shadow-red-950/30 cursor-pointer"
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ConfirmCancelDialog;

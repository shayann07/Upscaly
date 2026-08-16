import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmCancelDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /**
   * Optional third action, rendered as a quiet text button on the far left.
   * Used by the resume offer for "delete partial work": destructive enough
   * that it must exist, quiet enough that neither Enter nor Escape can ever
   * reach it -- those stay bound to confirm/dismiss.
   */
  secondaryText?: string;
  onSecondary?: () => void;
  /** Confirm styled as the accent action instead of the danger action. */
  confirmIsPositive?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmCancelDialog({
  isOpen,
  title = 'Cancel Active Upscale?',
  message = 'An upscaling job is currently in progress. Removing this file will terminate the background engine and release all GPU VRAM resources.',
  confirmText = 'Cancel & Free GPU',
  cancelText = 'Keep Running',
  secondaryText,
  onSecondary,
  confirmIsPositive = false,
  onConfirm,
  onDismiss,
}: ConfirmCancelDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Default focus to the safe ("keep running") action, not the
      // destructive one -- a keyboard user pressing Enter right after the
      // dialog opens shouldn't accidentally confirm the cancellation.
      cancelButtonRef.current?.focus();
    }
  }, [isOpen]);

  const handleTrapFocus = (e: React.KeyboardEvent) => {
    // Only two focusable elements exist in this dialog, so trapping focus
    // is just cycling Tab/Shift+Tab between them instead of letting focus
    // escape to whatever is behind the backdrop.
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const goingBackward = e.shiftKey;
    const isCancelFocused = document.activeElement === cancelButtonRef.current;
    if (goingBackward ? isCancelFocused : !isCancelFocused) {
      confirmButtonRef.current?.focus();
    } else {
      cancelButtonRef.current?.focus();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto"
          onKeyDown={handleTrapFocus}
        >
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
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-cancel-title"
            aria-describedby="confirm-cancel-message"
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
              <h3
                id="confirm-cancel-title"
                className="font-['Archivo',sans-serif] text-base font-semibold text-[var(--text-primary)]"
              >
                {title}
              </h3>
            </div>

            {/* Description */}
            <p
              id="confirm-cancel-message"
              className="text-xs leading-relaxed text-[var(--text-dim)] mb-6 font-['Archivo',sans-serif]"
            >
              {message}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              {secondaryText && onSecondary && (
                <button
                  type="button"
                  onClick={onSecondary}
                  className="mr-auto px-2 py-2 text-[11px] font-semibold text-[var(--text-dim)] bg-transparent border-none cursor-pointer transition-colors duration-150 hover:text-[var(--danger-text)]"
                >
                  {secondaryText}
                </button>
              )}
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border-default)] bg-[var(--bg-glass-subtle)] text-[var(--text-primary)] transition-all duration-150 hover:bg-[var(--border-default)] cursor-pointer"
              >
                {cancelText}
              </button>

              <button
                ref={confirmButtonRef}
                type="button"
                onClick={onConfirm}
                className={
                  confirmIsPositive
                    ? 'px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--text-primary)] transition-all duration-150 hover:bg-[var(--bg-hover)] cursor-pointer'
                    : 'px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--border-danger)] bg-[var(--danger-bg)] text-[var(--danger-text)] transition-all duration-150 hover:bg-[var(--danger-hover)] hover:text-[#F2C4BE] shadow-lg shadow-red-950/30 cursor-pointer'
                }
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

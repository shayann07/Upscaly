import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { STRINGS } from '../lib/strings';

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
  /**
   * Confirm styled as the accent action instead of the danger action, and
   * the eyebrow reads RECOVERY rather than CONFIRM.
   *
   * This component started life as the cancel prompt, so its styling was
   * uniformly destructive -- a red warning badge, a red confirm button.
   * Reusing it for the resume offer meant "Resume upscaling", the safe and
   * encouraged action, wore the visual language of "destroy something".
   */
  confirmIsPositive?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmCancelDialog({
  isOpen,
  title = STRINGS.CANCEL_TITLE,
  message = STRINGS.CANCEL_MESSAGE,
  confirmText = STRINGS.CANCEL_AND_FREE_GPU,
  cancelText = STRINGS.KEEP_RUNNING,
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
    // Only two elements are cycled, so trapping focus is just Tab/Shift+Tab
    // between them instead of letting focus escape to whatever is behind
    // the backdrop. The optional secondary action is deliberately outside
    // the cycle: it is the destructive one, and it should take a deliberate
    // click rather than a stray keypress.
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
            className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
          />

          {/*
            Panel geometry matches the settings and catalog panels -- 14px
            radius, the same surface and subtle border -- so a dialog reads
            as part of the app rather than a browser alert dropped on top of
            it.
          */}
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-cancel-title"
            aria-describedby="confirm-cancel-message"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-[400px] max-w-[90vw] rounded-[14px] border border-[var(--border-subtle)] bg-[rgba(13,12,11,.97)] shadow-[var(--shadow-modal)] overflow-hidden select-none"
          >
            {/*
              Every panel in this app is titled with a Martian Mono eyebrow
              rather than an icon badge, and the word carries the tone -- so
              a recovery prompt no longer borrows the cancel dialog's
              warning triangle and red header.
            */}
            <div className="h-[38px] flex-none flex items-center px-3.5 border-b border-[var(--border-default)]">
              <span
                className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em]"
                style={{ color: confirmIsPositive ? 'var(--text-muted)' : 'var(--danger-text)' }}
              >
                {confirmIsPositive ? 'RECOVERY' : 'CONFIRM'}
              </span>
            </div>

            <div className="p-3.5">
              <h3
                id="confirm-cancel-title"
                className="font-['Archivo',sans-serif] text-[13px] font-semibold text-[var(--text-primary)] mb-1.5"
              >
                {title}
              </h3>

              <p
                id="confirm-cancel-message"
                className="font-['Archivo',sans-serif] text-[11.5px] leading-[1.5] text-[var(--text-muted)] mb-4"
              >
                {message}
              </p>

              <div className="flex items-center justify-end gap-2">
                {secondaryText && onSecondary && (
                  <button
                    type="button"
                    onClick={onSecondary}
                    className="mr-auto px-1 font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] text-[var(--text-dim)] bg-transparent border-none cursor-pointer transition-colors duration-150 hover:text-[var(--danger-text)]"
                  >
                    {secondaryText}
                  </button>
                )}

                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={onDismiss}
                  className="h-8 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] text-[var(--text-secondary)] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                >
                  {cancelText}
                </button>

                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={onConfirm}
                  className="h-8 px-3 rounded-lg font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:shadow-[var(--shadow-pill-hover)]"
                  style={
                    confirmIsPositive
                      ? {
                          border: '1px solid var(--accent)',
                          background: 'var(--accent-bg)',
                          color: 'var(--text-primary)',
                        }
                      : {
                          border: '1px solid var(--border-danger)',
                          background: 'var(--danger-bg)',
                          color: 'var(--danger-text)',
                        }
                  }
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ConfirmCancelDialog;

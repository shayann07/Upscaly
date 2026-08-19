import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UpdatePhase } from '../store/studioStore';

interface UpdateBadgeProps {
  version: string;
  notes: string;
  phase: UpdatePhase;
  progress: number;
  onInstall: () => void;
}

const BUSY_LABEL: Partial<Record<UpdatePhase, string>> = {
  downloading: 'Downloading',
  installing: 'Installing',
};

/**
 * The "an update is ready" affordance: a pill in the titlebar that opens
 * the release notes.
 *
 * Replaces a version of this component that was never rendered anywhere --
 * it was written against an earlier purple palette, and described *model*
 * downloads rather than app updates. Everything here is on the current
 * design tokens so it sits in the titlebar alongside the window controls
 * rather than looking like a transplant.
 */
export function UpdateBadge({ version, notes, phase, progress, onInstall }: UpdateBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const busy = phase === 'downloading' || phase === 'installing';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={`Upscaly Studio ${version} is available`}
        className="pointer-events-auto flex items-center gap-1.5 h-[22px] px-2 rounded-full border border-[var(--border-default)] bg-[var(--accent-bg)] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] text-[var(--text-secondary)] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
      >
        <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" aria-hidden="true" />
        <span>{busy ? (BUSY_LABEL[phase] ?? 'UPDATE') : `UPDATE ${version}`}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => !busy && setIsOpen(false)}
              className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="update-title"
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-[420px] max-w-[90vw] rounded-[14px] border border-[var(--border-subtle)] bg-[rgba(13,12,11,.97)] shadow-[var(--shadow-modal)] overflow-hidden select-none"
            >
              <div className="h-[38px] flex-none flex items-center px-3.5 border-b border-[var(--border-default)]">
                <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[var(--text-muted)]">
                  UPDATE AVAILABLE
                </span>
              </div>

              <div className="p-3.5">
                <h3
                  id="update-title"
                  className="font-['Archivo',sans-serif] text-[13px] font-semibold text-[var(--text-primary)] mb-1.5"
                >
                  Upscaly Studio {version}
                </h3>

                {notes ? (
                  <div className="max-h-[220px] overflow-y-auto mb-4 p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                    <pre className="font-['Archivo',sans-serif] text-[11.5px] leading-[1.55] text-[var(--text-tertiary)] whitespace-pre-wrap break-words m-0">
                      {notes}
                    </pre>
                  </div>
                ) : (
                  <p className="font-['Archivo',sans-serif] text-[11.5px] leading-[1.5] text-[var(--text-muted)] mb-4">
                    No release notes were published for this version.
                  </p>
                )}

                {phase === 'downloading' && (
                  <div className="mb-3">
                    <div className="flex justify-between font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] text-[var(--text-muted)] mb-1.5">
                      <span>DOWNLOADING</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-[3px] rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{ width: `${progress}%`, transition: 'width .25s linear' }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={busy}
                    className="h-8 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] text-[var(--text-secondary)] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-default disabled:hover:scale-100"
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    onClick={onInstall}
                    disabled={busy}
                    className="h-8 px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-bg)] font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] text-[var(--text-primary)] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:shadow-[var(--shadow-pill-hover)] disabled:opacity-40 disabled:cursor-default disabled:hover:scale-100"
                  >
                    {busy ? (BUSY_LABEL[phase] ?? 'Working') : 'Restart & Install'}
                  </button>
                </div>

                {/*
                  The install replaces the running binary and relaunches, so
                  say so before the click rather than surprising someone
                  mid-job.
                */}
                <p className="font-['Archivo',sans-serif] text-[10.5px] leading-[1.45] text-[var(--text-dim)] mt-2.5 text-right">
                  Upscaly Studio will close and reopen. Finish any running job first.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default UpdateBadge;

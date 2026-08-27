interface ScratchDirSectionProps {
  scratchDir: string;
  onSelectFolder: () => void;
  onClearFolder: () => void;
}

/**
 * Moves per-job staging off the system drive.
 *
 * A video job keeps every upscaled frame on disk until reassembly, as
 * lossless PNG: at 4x that is roughly 22 MB per frame, so a couple of
 * thousand 1080p frames need ~83 GB. Staging defaults to the platform cache
 * directory under %LOCALAPPDATA%, which on a laptop is routinely the
 * *smallest* volume -- jobs get refused for space while a data drive sits
 * empty. Pointing this at that drive is the difference between the feature
 * working and not.
 *
 * Nothing durable lives here: the folder holds one directory per running job
 * and is cleaned up when the job ends.
 */
export function ScratchDirSection({
  scratchDir,
  onSelectFolder,
  onClearFolder,
}: ScratchDirSectionProps) {
  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
          VIDEO STAGING FOLDER
        </span>
        {scratchDir && (
          <button
            onClick={onClearFolder}
            className="border border-[var(--border-default)] px-1.5 py-0.5 rounded bg-transparent font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] text-[var(--text-muted)] cursor-pointer transition-all duration-200 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            CLEAR
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={scratchDir}
          readOnly
          placeholder="Default (system drive)"
          title={scratchDir || undefined}
          className="flex-1 min-w-0 px-2.5 py-2 border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] font-['Martian_Mono',monospace] text-[10px] text-[var(--text-secondary)] outline-none"
        />
        <button
          onClick={onSelectFolder}
          className="flex-none px-3 border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
        >
          Browse
        </button>
      </div>
      <div className="text-[11.5px] leading-[1.5] mt-2 text-[var(--text-muted)]">
        Video upscaling needs tens of GB of temporary frames. Point this at a drive with room if
        jobs fail for disk space. Cleared automatically after each job.
      </div>
    </div>
  );
}

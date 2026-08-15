interface CustomModelsSectionProps {
  customModelsDir: string;
  onSelectFolder: () => void;
  onClearFolder: () => void;
}

/**
 * Points the app at a folder of user-supplied ncnn models.
 *
 * Nothing is copied: the files stay where they are and the engine is pointed
 * at that directory for jobs that use one of them. The app's own models take
 * precedence on a name collision, so dropping a file called
 * `realesrgan-x4plus.param` in here cannot quietly change what the built-in
 * selection runs.
 */
export function CustomModelsSection({
  customModelsDir,
  onSelectFolder,
  onClearFolder,
}: CustomModelsSectionProps) {
  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
          CUSTOM MODEL FOLDER
        </span>
        {customModelsDir && (
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
          value={customModelsDir}
          readOnly
          placeholder="None selected"
          title={customModelsDir || undefined}
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
        Any <code>.param</code> + <code>.bin</code> pair in this folder appears in the model list.
        Files stay where they are.
      </div>
    </div>
  );
}

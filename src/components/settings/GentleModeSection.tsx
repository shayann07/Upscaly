interface GentleModeSectionProps {
  on: boolean;
  onToggle: (on: boolean) => void;
  accentColor: string;
}

/**
 * The thermal-headroom trade: a pause between video batches and one tile
 * step below the governor's pick. Exists for machines whose GPU resets
 * under hours of sustained full load -- the description says the cost out
 * loud because "slower on purpose" is only acceptable when chosen.
 */
export function GentleModeSection({ on, onToggle, accentColor }: GentleModeSectionProps) {
  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="flex items-center justify-between">
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
          GENTLE MODE
        </span>
        <button
          onClick={() => onToggle(!on)}
          aria-pressed={on}
          className="h-7 px-3 rounded-lg font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] cursor-pointer transition-all duration-200 hover:scale-[1.05]"
          style={{
            border: `1px solid ${on ? accentColor : 'var(--border-default)'}`,
            background: on ? 'var(--accent-bg)' : 'var(--bg-elevated)',
            color: on ? 'var(--text-primary)' : '#7E7871',
          }}
        >
          {on ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="text-[11.5px] leading-[1.5] mt-2 text-[var(--text-muted)]">
        Pauses between video batches and steps the tile down one notch. ~10–20% slower, cooler GPU —
        for long runs on machines that crash under sustained load.
      </div>
    </div>
  );
}

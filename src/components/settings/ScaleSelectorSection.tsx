interface ScaleSelectorSectionProps {
  activeScale: number;
  big: boolean;
  pillStyle: (active: boolean, isBig: boolean) => React.CSSProperties;
  onSelectScale: (s: number) => void;
}

export function ScaleSelectorSection({
  activeScale,
  big,
  pillStyle,
  onSelectScale,
}: ScaleSelectorSectionProps) {
  return (
    <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
      <button
        onClick={() => onSelectScale(2)}
        style={pillStyle(activeScale === 2, big)}
        className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        2×
      </button>
      <button
        onClick={() => onSelectScale(3)}
        style={pillStyle(activeScale === 3, big)}
        className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        3×
      </button>
      <button
        onClick={() => onSelectScale(4)}
        style={pillStyle(activeScale === 4, big)}
        className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        4×
      </button>
    </div>
  );
}

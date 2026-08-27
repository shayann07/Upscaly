import { SUPPORTED_SCALES } from '../../lib/types';

interface ScaleSelectorSectionProps {
  activeScale: number;
  pillStyle: (active: boolean) => React.CSSProperties;
  onSelectScale: (s: number) => void;
  /**
   * The factors some model in the current category can actually produce.
   * Anything outside this is rendered disabled.
   */
  availableScales?: number[];
}

export function ScaleSelectorSection({
  activeScale,
  pillStyle,
  onSelectScale,
  availableScales,
}: ScaleSelectorSectionProps) {
  return (
    <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
      {SUPPORTED_SCALES.map((s) => {
        // `undefined` means the caller has nothing to say -- during the first
        // render, before the catalog has loaded, every factor is offered
        // rather than briefly greying out the one that is already selected.
        const unavailable = availableScales !== undefined && !availableScales.includes(s);
        return (
          <button
            key={s}
            onClick={() => onSelectScale(s)}
            disabled={unavailable}
            title={unavailable ? `No model in this category outputs ${s}×` : undefined}
            style={{
              ...pillStyle(activeScale === s),
              ...(unavailable ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
            }}
            className={
              unavailable
                ? 'transition-all duration-200'
                : 'transition-all duration-200 hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
            }
          >
            {s}×
          </button>
        );
      })}
    </div>
  );
}

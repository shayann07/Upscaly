import { QualityPreset } from '../../lib/types';

interface PresetSectionProps {
  preset: QualityPreset;
  onSelectPreset: (preset: QualityPreset) => void;
  accentColor: string;
}

const PRESETS: { value: QualityPreset; label: string }[] = [
  { value: 'quality', label: 'QUALITY' },
  { value: 'balanced', label: 'BALANCED' },
  { value: 'speed', label: 'SPEED' },
];

/**
 * What each preset actually changes, stated in the panel rather than left
 * for the user to infer from a runtime that turned out to be eight times
 * longer than they expected.
 */
const DESCRIPTIONS: Record<QualityPreset, string> = {
  quality:
    'Largest tile the card allows, plus TTA — each tile is run 8 times and averaged. Cleaner edges, roughly 8× the time.',
  balanced: 'Engine-tuned tile size, single pass. The default.',
  speed:
    'Same image as Balanced, with wider decode and encode threads — helps most on large batches. GPU work is unchanged.',
};

export function PresetSection({ preset, onSelectPreset, accentColor }: PresetSectionProps) {
  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
          PRESET
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Quality preset">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onSelectPreset(p.value)}
            aria-pressed={preset === p.value}
            className="h-8 rounded-lg font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
            style={{
              border: `1px solid ${preset === p.value ? accentColor : 'var(--border-default)'}`,
              background: preset === p.value ? 'var(--accent-bg)' : 'var(--bg-elevated)',
              color: preset === p.value ? 'var(--text-primary)' : '#7E7871',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div
        className="text-[11.5px] leading-[1.5] mt-2 transition-colors duration-200"
        style={{ color: 'var(--text-muted)' }}
      >
        {DESCRIPTIONS[preset]}
      </div>
    </div>
  );
}

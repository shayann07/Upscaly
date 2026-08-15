import { OutputFormat } from '../../lib/types';

interface OutputFormatSectionProps {
  outputFormat: OutputFormat;
  onSelectOutputFormat: (format: OutputFormat) => void;
  accentColor: string;
}

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WEBP' },
];

const DESCRIPTIONS: Record<OutputFormat, string> = {
  png: 'Lossless — exactly what the model produced. Large files.',
  jpg: 'Lossy. Discards some of the detail the upscale just produced, in exchange for a much smaller file.',
  webp: 'Lossy, but noticeably better than JPG at the same size, and keeps transparency.',
};

/** Videos are always MP4; this setting only governs image results. */
export function OutputFormatSection({
  outputFormat,
  onSelectOutputFormat,
  accentColor,
}: OutputFormatSectionProps) {
  const isLossy = outputFormat !== 'png';

  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
          OUTPUT FORMAT
        </span>
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] text-[var(--text-dim)]">
          IMAGES ONLY
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Output format">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            onClick={() => onSelectOutputFormat(f.value)}
            aria-pressed={outputFormat === f.value}
            className="h-8 rounded-lg font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
            style={{
              border: `1px solid ${outputFormat === f.value ? accentColor : 'var(--border-default)'}`,
              background: outputFormat === f.value ? 'var(--accent-bg)' : 'var(--bg-elevated)',
              color: outputFormat === f.value ? 'var(--text-primary)' : '#7E7871',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div
        className="text-[11.5px] leading-[1.5] mt-2 transition-colors duration-200"
        // Lossy choices are tinted, not hidden. Re-encoding a finished
        // upscale throws away part of what the run just spent minutes
        // producing, and that is worth seeing at the moment of choosing.
        style={{ color: isLossy ? '#E8B980' : 'var(--text-muted)' }}
      >
        {DESCRIPTIONS[outputFormat]}
      </div>
    </div>
  );
}

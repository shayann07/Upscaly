interface TileSizeSectionProps {
  tileSize: number;
  handleTileSize: (size: number) => void;
  handleAutoTuneClick: () => void;
  isOverflowing: boolean;
  // null until the backend reports a profile; see useVramProfile.
  usedVramGb: number | null;
  totalVramGb: number | null;
  statusMessage?: string;
  accentColor: string;
}

export function TileSizeSection({
  tileSize,
  handleTileSize,
  handleAutoTuneClick,
  isOverflowing,
  usedVramGb,
  totalVramGb,
  statusMessage,
  accentColor,
}: TileSizeSectionProps) {
  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
          TILE SIZE
        </span>
        <button
          onClick={handleAutoTuneClick}
          className="border border-[var(--accent-border)] px-1.5 py-0.5 rounded bg-[var(--accent-bg)] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)]"
          style={{ color: accentColor }}
        >
          AUTO-TUNE
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[
          { v: 0, label: 'AUTO' },
          { v: 128, label: '128' },
          { v: 256, label: '256' },
          { v: 384, label: '384' },
          { v: 512, label: '512' },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => handleTileSize(t.v)}
            className="h-8 rounded-lg font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
            style={{
              border: `1px solid ${tileSize === t.v ? (isOverflowing ? '#E88A80' : accentColor) : 'var(--border-default)'}`,
              background:
                tileSize === t.v
                  ? isOverflowing
                    ? 'rgba(232,138,128,.15)'
                    : 'var(--accent-bg)'
                  : 'var(--bg-elevated)',
              color:
                tileSize === t.v ? (isOverflowing ? '#E88A80' : 'var(--text-primary)') : '#7E7871',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="text-[11.5px] leading-[1.5] mt-2 transition-colors duration-200"
        style={{ color: isOverflowing ? '#E88A80' : 'var(--text-muted)' }}
      >
        {statusMessage ||
          (usedVramGb === null || totalVramGb === null
            ? `Selected tile size: ${tileSize}px.`
            : isOverflowing
              ? `Projected VRAM usage (${usedVramGb.toFixed(1)} GB) exceeds GPU memory (${totalVramGb.toFixed(1)} GB). Consider selecting 256px or 128px.`
              : `Selected tile size: ${tileSize}px. Projected VRAM usage: ${usedVramGb.toFixed(1)} GB.`)}
      </div>
    </div>
  );
}

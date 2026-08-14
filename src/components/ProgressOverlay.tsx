import { motion } from 'framer-motion';

interface ProgressOverlayProps {
  phase?: string;
  eta?: string;
  rate?: string;
  vram?: string;
  tileCount?: string;
  onCancel?: () => void;
  // Alternate prop names support
  percentage?: number;
  statusText?: string;
  fps?: number;
  etaSeconds?: number;
}

export function ProgressOverlay({
  phase = 'PREPARING',
  eta,
  rate,
  vram = '-- GB',
  tileCount = 'AUTO',
  onCancel = () => {},
  percentage,
  statusText,
  fps,
  etaSeconds,
}: ProgressOverlayProps) {
  const displayEta =
    etaSeconds !== undefined && etaSeconds > 0
      ? `${Math.floor(etaSeconds / 60)}:${(etaSeconds % 60).toString().padStart(2, '0')}`
      : eta && eta !== '--:--' && eta !== '0:05'
        ? eta
        : null;

  const rawPhase = statusText || phase;

  // Format percentage cleanly without duplicate numbers
  const hasPercentage = rawPhase.includes('%');
  const displayPhase = hasPercentage
    ? rawPhase
    : percentage !== undefined
      ? `${rawPhase} · ${percentage.toFixed(1)}%`
      : rawPhase;

  const displayRate =
    fps !== undefined && fps > 0
      ? `${fps.toFixed(1)} FPS`
      : rate && rate !== '-- MP/s' && rate !== '14.2 MP/s' && rate !== ''
        ? rate
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 14, x: '-50%' }}
      transition={{ duration: 0.3, ease: [0.22, 1.3, 0.36, 1] }}
      className="absolute bottom-[78px] left-1/2 flex items-center gap-4 z-[35] select-none transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={{
        padding: '11px 14px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        background: 'rgba(11,10,9,.95)',
        boxShadow: '0 18px 44px rgba(0,0,0,.65)',
      }}
    >
      {/* Phase label */}
      <div className="flex items-center gap-2">
        <span className="font-['Martian_Mono',monospace] text-[10px] tracking-[0.08em] text-[var(--accent)] whitespace-nowrap">
          {displayPhase}
        </span>
      </div>

      <div className="w-px h-5 bg-[var(--border-default)]" />

      {/* Telemetry stats */}
      <div className="flex items-center gap-3.5 font-['Martian_Mono',monospace] text-[10px] whitespace-nowrap">
        <span className="text-[var(--text-dim)] flex items-center gap-1">
          ETA{' '}
          {displayEta ? (
            <span className="text-[var(--text-primary)] font-semibold">{displayEta}</span>
          ) : (
            <span className="inline-flex items-center text-[var(--text-dim)] opacity-75">
              <span className="animate-pulse">Calculating…</span>
            </span>
          )}
        </span>

        <span className="text-[var(--text-dim)] flex items-center gap-1">
          RATE{' '}
          {displayRate ? (
            <span className="text-[var(--text-primary)] font-semibold">{displayRate}</span>
          ) : (
            <span className="inline-flex items-center text-[var(--text-dim)] opacity-75">
              <span className="animate-pulse">Calculating…</span>
            </span>
          )}
        </span>

        <span className="text-[var(--text-dim)]">
          VRAM <span className="text-[var(--text-primary)] font-semibold">{vram}</span>
        </span>

        <span className="text-[var(--text-dim)]">
          TILE <span className="text-[var(--text-primary)] font-semibold">{tileCount}</span>
        </span>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="h-[26px] px-3 border border-[var(--border-danger)] rounded-lg bg-[var(--danger-bg)] text-[var(--danger-text)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--danger-hover)] hover:text-[#F2C4BE]"
      >
        Cancel
      </button>
    </motion.div>
  );
}

export default ProgressOverlay;

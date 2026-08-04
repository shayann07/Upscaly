import { motion } from "framer-motion";

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
  phase = "PREPARING",
  eta = "--:--",
  rate = "-- MP/s",
  vram = "-- GB",
  tileCount = "0/0",
  onCancel = () => {},
  percentage,
  statusText,
  etaSeconds,
}: ProgressOverlayProps) {
  const displayEta = etaSeconds !== undefined ? `${Math.floor(etaSeconds / 60)}:${(etaSeconds % 60).toString().padStart(2, "0")}` : eta;
  const displayPhase = statusText || phase;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, x: "-50%" }}
      animate={{ opacity: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, y: 14, x: "-50%" }}
      transition={{ duration: 0.3, ease: [0.22, 1.3, 0.36, 1] }}
      className="absolute bottom-[78px] left-1/2 flex items-center gap-4 z-[35]"
      style={{
        padding: "11px 14px",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        background: "rgba(11,10,9,.95)",
        boxShadow: "0 18px 44px rgba(0,0,0,.65)",
      }}
    >
      {/* Phase label */}
      <div className="flex items-center gap-2">
        <span className="font-['Martian_Mono',monospace] text-[10px] tracking-[0.08em] text-[var(--accent)] whitespace-nowrap">
          {displayPhase} {percentage !== undefined ? `${percentage.toFixed(1)}%` : ""}
        </span>
      </div>

      <div className="w-px h-5 bg-[var(--border-default)]" />

      {/* Telemetry stats */}
      <div className="flex items-center gap-3.5 font-['Martian_Mono',monospace] text-[10px] whitespace-nowrap">
        <span className="text-[var(--text-dim)]">
          ETA <span className="text-[var(--text-primary)]">{displayEta}</span>
        </span>
        <span className="text-[var(--text-dim)]">
          RATE <span className="text-[var(--text-primary)]">{rate}</span>
        </span>
        <span className="text-[var(--text-dim)]">
          VRAM <span className="text-[var(--text-primary)]">{vram}</span>
        </span>
        <span className="text-[var(--text-dim)]">
          TILE <span className="text-[var(--text-primary)]">{tileCount}</span>
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

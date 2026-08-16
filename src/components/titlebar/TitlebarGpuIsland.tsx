import { memo, useState } from 'react';
import { GpuInfo } from '../../lib/types';
import { useGpuTelemetry } from '../../hooks/useGpuTelemetry';
import { useIsProcessing } from '../../store/selectors';

/** Absent readings render as an em-dash, never as an invented number. */
const dash = (v: number | null | undefined, unit: string) => (v == null ? '—' : `${v}${unit}`);

interface TitlebarGpuIslandProps {
  selectedGpu: number;
  availableGpus: GpuInfo[];
  onSelectGpu: (id: number) => void;
  isVramOverflowing: boolean;
  accentColor: string;
}

function TitlebarGpuIslandImpl({
  selectedGpu,
  availableGpus,
  onSelectGpu,
  isVramOverflowing,
  accentColor,
}: TitlebarGpuIslandProps) {
  const [gpuMenuOpen, setGpuMenuOpen] = useState(false);

  const currentGpu = availableGpus.find((g) => g.id === selectedGpu);
  const gpuLabel = currentGpu ? currentGpu.name : 'GPU Acceleration';

  // Subscribed here rather than threaded through Titlebar's props: the
  // reading changes every two seconds during a run, and only this island
  // should re-render for it.
  const isProcessing = useIsProcessing();
  const telemetry = useGpuTelemetry(isProcessing);

  return (
    <div
      className={`pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-[41] border bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)] ${
        isVramOverflowing
          ? 'border-[#E88A80] shadow-[0_0_12px_rgba(232,138,128,0.25)]'
          : 'border-[var(--border-subtle)]'
      }`}
      style={{
        width: gpuMenuOpen ? 310 : isVramOverflowing ? 275 : telemetry ? 280 : 210,
        borderRadius: gpuMenuOpen ? 14 : 11,
        transformOrigin: 'top center',
      }}
    >
      <button
        onClick={() => setGpuMenuOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 h-[34px] px-3 border-none bg-transparent cursor-pointer transition-colors duration-150 pointer-events-auto"
      >
        <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.07em] text-[var(--text-dim)] flex-none">
          GPU
        </span>
        {telemetry ? (
          // During a run the island reports what the silicon is doing --
          // that is the moment the name matters least and the temperature
          // matters most. VRAM here is measured by the driver, unlike the
          // projection shown in settings.
          <span className="font-['Martian_Mono',monospace] text-[9.5px] text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0 text-center">
            {dash(telemetry.temperature_c, '°C')} · {dash(telemetry.utilization_pct, '%')} ·{' '}
            {telemetry.memory_used_mb != null && telemetry.memory_total_mb != null
              ? `${(telemetry.memory_used_mb / 1024).toFixed(1)}/${(telemetry.memory_total_mb / 1024).toFixed(1)}G`
              : '—'}{' '}
            · fan {dash(telemetry.fan_pct, '%')}
          </span>
        ) : (
          <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0 text-center">
            {gpuLabel}
          </span>
        )}
        {isVramOverflowing && (
          <span className="flex-none px-1.5 py-0.5 rounded-full font-['Martian_Mono',monospace] text-[8px] font-bold tracking-[0.06em] bg-[rgba(232,138,128,0.18)] text-[#E88A80] border border-[rgba(232,138,128,0.4)] animate-pulse">
            OVERFLOW
          </span>
        )}
        <span
          className="flex-none text-[var(--text-dim)] text-[9px] transition-transform duration-300"
          style={{
            transform: `rotate(${gpuMenuOpen ? 180 : 0}deg)`,
            transition: 'transform .24s var(--ease-spring)',
          }}
        >
          ▾
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: gpuMenuOpen ? 210 : 0,
          opacity: gpuMenuOpen ? 1 : 0,
          transition: 'max-height .28s var(--ease-spring), opacity .2s ease',
        }}
      >
        <div className="p-1.5 border-t border-[var(--border-default)]">
          {availableGpus.map((gpu) => (
            <div
              key={gpu.id}
              onClick={() => {
                onSelectGpu(gpu.id);
                setGpuMenuOpen(false);
              }}
              className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              style={{
                background: selectedGpu === gpu.id ? 'var(--bg-active)' : 'transparent',
              }}
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {gpu.name}
                </div>
                <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)]">
                  {gpu.detail}
                </div>
              </div>
              {selectedGpu === gpu.id && (
                <span className="text-xs" style={{ color: accentColor }}>
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized: the titlebar re-renders on every job progress event, but this
 * island only depends on GPU selection and VRAM state. All five props are
 * primitives or references owned by useSettings, so they stay referentially
 * stable across progress ticks and the memo actually holds.
 */
export const TitlebarGpuIsland = memo(TitlebarGpuIslandImpl);

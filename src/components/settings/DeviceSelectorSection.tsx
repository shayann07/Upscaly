import { GpuInfo } from '../AdvancedSettings';

interface DeviceSelectorSectionProps {
  devices: GpuInfo[];
  selectedGpu: number;
  onSelectGpu: (id: number) => void;
  accentColor: string;
  isOverflowing: boolean;
  usedVramGb: number;
  totalVramGb: number;
  vramPct: number;
  EASE: string;
}

export function DeviceSelectorSection({
  devices,
  selectedGpu,
  onSelectGpu,
  accentColor,
  isOverflowing,
  usedVramGb,
  totalVramGb,
  vramPct,
  EASE,
}: DeviceSelectorSectionProps) {
  return (
    <div className="p-3.5 border-b border-[var(--border-default)]">
      <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-2.5">
        DEVICE
      </div>
      {devices.map((gpu) => (
        <div
          key={gpu.id}
          onClick={() => onSelectGpu(gpu.id)}
          className="flex items-center gap-2.5 p-2.5 mb-1.5 cursor-pointer rounded-[10px] transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
          style={{
            border: `1px solid ${selectedGpu === gpu.id ? 'var(--border-subtle)' : 'var(--border-default)'}`,
            background: selectedGpu === gpu.id ? 'var(--bg-active)' : 'transparent',
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-semibold text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis">
              {gpu.name}
            </div>
            <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em] mt-0.5">
              {gpu.detail}
            </div>
          </div>
          {selectedGpu === gpu.id && (
            <span className="flex-none w-3 text-[11px]" style={{ color: accentColor }}>
              ✓
            </span>
          )}
        </div>
      ))}

      <div className="mt-3">
        <div className="flex justify-between items-baseline font-['Martian_Mono',monospace] text-[9px] tracking-[0.05em] mb-1.5">
          <span style={{ color: isOverflowing ? '#E88A80' : 'var(--text-dim)' }}>
            VRAM {isOverflowing ? '· OVERFLOW' : ''}
          </span>
          <span>
            <span style={{ color: isOverflowing ? '#E88A80' : '#DDD8D2' }}>
              {usedVramGb.toFixed(1)} GB
            </span>
            <span className="text-[var(--text-dim)]"> / {totalVramGb.toFixed(1)} GB</span>
          </span>
        </div>
        <div className="h-1 rounded-sm bg-[#1B1917] overflow-hidden shadow-[inset_0_0_0_1px_var(--border-default)]">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${vramPct}%`,
              background: isOverflowing ? '#E88A80' : accentColor,
              transition: `width .3s ${EASE}, background .3s ${EASE}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

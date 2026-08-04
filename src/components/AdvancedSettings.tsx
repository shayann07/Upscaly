import { GpuInfo } from "../lib/types";

interface GpuDevice {
  id: number;
  name: string;
}

interface AdvancedSettingsProps {
  selectedGpu?: number;
  availableGpus?: GpuInfo[];
  gpus?: GpuDevice[];
  onSelectGpu?: (id: number) => void;
  tileSize?: number;
  onSetTileSize?: (size: number) => void;
  onSelectTileSize?: (size: number) => void;
  outputDir?: string;
  customOutputPath?: string;
  onSetOutputDir?: (dir: string) => void;
  onSelectOutputPath?: () => void;
  vramUsage?: string;
  accentColor?: string;
  onClose?: () => void;
  onAutoTune?: () => void;
  isOpen?: boolean;
}

export function AdvancedSettings({
  selectedGpu = 0,
  availableGpus,
  gpus,
  onSelectGpu = () => {},
  tileSize = 0,
  onSetTileSize,
  onSelectTileSize,
  outputDir = "~/Pictures/Upscaled",
  customOutputPath,
  onSelectOutputPath,
  vramUsage = "0 GB",
  accentColor = "var(--accent)",
  onClose = () => {},
  onAutoTune = () => {},
}: AdvancedSettingsProps) {
  const EASE = "var(--ease-spring)";

  const devices: GpuInfo[] = availableGpus || (gpus ? gpus.map(g => ({ id: g.id, name: g.name, detail: "VULKAN" })) : []);
  const handleTileSize = onSetTileSize || onSelectTileSize || (() => {});
  const displayOutputDir = customOutputPath || outputDir;

  return (
    <div className="h-full flex flex-col border border-[var(--border-subtle)] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[var(--shadow-panel)] overflow-hidden">
      {/* Header */}
      <div className="h-[38px] flex-none flex items-center justify-between px-3 border-b border-[var(--border-default)]">
        <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[var(--text-muted)]">SETTINGS</span>
        <button
          onClick={onClose}
          className="w-[22px] h-[22px] flex items-center justify-center border-none rounded-[7px] bg-transparent text-[var(--text-muted)] text-[14px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* GPU Selection */}
        <div className="p-3.5 border-b border-[var(--border-default)]">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-2.5">DEVICE</div>
          {devices.map((gpu) => (
            <div
              key={gpu.id}
              onClick={() => onSelectGpu(gpu.id)}
              className="flex items-center gap-2.5 p-2.5 mb-1.5 cursor-pointer rounded-[10px] transition-all duration-200"
              style={{
                border: `1px solid ${selectedGpu === gpu.id ? "var(--border-subtle)" : "var(--border-default)"}`,
                background: selectedGpu === gpu.id ? "var(--bg-active)" : "transparent",
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] font-semibold text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis">{gpu.name}</div>
                <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em] mt-0.5">{gpu.detail}</div>
              </div>
              {selectedGpu === gpu.id && <span className="flex-none w-3 text-[11px]" style={{ color: accentColor }}>✓</span>}
            </div>
          ))}

          {/* VRAM bar */}
          <div className="mt-3">
            <div className="flex justify-between items-baseline font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.05em] mb-1.5">
              <span>VRAM</span>
              <span>
                <span className="text-[#DDD8D2]">{vramUsage}</span>
                <span className="text-[var(--text-dim)]"> / {selectedGpu === -1 ? "SYSTEM RAM" : "12.0 GB"}</span>
              </span>
            </div>
            <div className="h-1 rounded-sm bg-[#1B1917] overflow-hidden shadow-[inset_0_0_0_1px_var(--border-default)]">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${selectedGpu === -1 ? 0 : 40}%`,
                  background: accentColor,
                  transition: `width .3s ${EASE}`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Tile Size */}
        <div className="p-3.5 border-b border-[var(--border-default)]">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">TILE SIZE</span>
            <button
              onClick={onAutoTune}
              className="border-none bg-transparent font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] cursor-pointer p-0 hover:text-[var(--text-primary)]"
              style={{ color: accentColor }}
            >
              AUTO-TUNE
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { v: 0, label: "AUTO" },
              { v: 128, label: "128" },
              { v: 256, label: "256" },
              { v: 512, label: "512" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => handleTileSize(t.v)}
                className="h-8 rounded-lg font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.03em] cursor-pointer transition-all duration-200"
                style={{
                  border: `1px solid ${tileSize === t.v ? accentColor : "var(--border-default)"}`,
                  background: tileSize === t.v ? "var(--accent-bg)" : "var(--bg-elevated)",
                  color: tileSize === t.v ? "var(--text-primary)" : "#7E7871",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="text-[11.5px] text-[var(--text-muted)] leading-[1.5] mt-2">
            {tileSize === 0
              ? "Tile size is derived from available VRAM at job start."
              : "Smaller tiles use less VRAM and run slower. 256 suits most 8 GB cards."}
          </div>
        </div>

        {/* Output Directory */}
        <div className="p-3.5">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-2.5">OUTPUT</div>
          <div className="flex gap-1.5">
            <div className="flex-1 min-w-0 px-2.5 py-2 border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] font-['Martian_Mono',monospace] text-[10px] text-[var(--text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis">
              {displayOutputDir}
            </div>
            <button
              onClick={onSelectOutputPath || (() => {})}
              className="flex-none px-3 border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Browse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdvancedSettings;

import { useMemo } from 'react';
import { DeviceSelectorSection } from './settings/DeviceSelectorSection';

export interface GpuInfo {
  id: number;
  name: string;
  detail?: string;
}

export interface AdvancedSettingsProps {
  selectedGpu?: number;
  availableGpus?: GpuInfo[];
  gpus?: GpuInfo[];
  onSelectGpu?: (id: number) => void;
  tileSize?: number;
  onSetTileSize?: (size: number) => void;
  onSelectTileSize?: (size: number) => void;
  outputDir?: string;
  customOutputPath?: string;
  onSetOutputDir?: (dir: string) => void;
  onSelectOutputPath?: () => void;
  accentColor?: string;
  onClose?: () => void;
  onAutoTune?: (recommendedTile: number, vramText: string) => void;
  isProcessing?: boolean;
}

export function AdvancedSettings({
  selectedGpu = 0,
  availableGpus,
  gpus,
  onSelectGpu = () => {},
  tileSize = 0,
  onSetTileSize,
  onSelectTileSize,
  outputDir = '~/Pictures/Upscaled',
  customOutputPath,
  onSetOutputDir,
  onSelectOutputPath,
  accentColor = 'var(--accent)',
  onClose = () => {},
  onAutoTune,
  isProcessing = false,
}: AdvancedSettingsProps) {
  const EASE = 'var(--ease-spring)';

  const devices: GpuInfo[] =
    availableGpus ||
    (gpus
      ? gpus.map((g) => ({
          id: g.id,
          name: g.name,
          detail: g.detail || 'VULKAN',
        }))
      : []);
  const handleTileSize = onSetTileSize || onSelectTileSize || (() => {});
  const displayOutputDir =
    customOutputPath !== undefined ? customOutputPath : outputDir;

  const currentGpu = useMemo(() => {
    return devices.find((g) => g.id === selectedGpu) || devices[0];
  }, [devices, selectedGpu]);

  const totalVramGb = useMemo(() => {
    if (!currentGpu) return 8;
    const match =
      currentGpu.name.match(/(\d+)\s*GB/i) ||
      (currentGpu.detail && currentGpu.detail.match(/(\d+)\s*GB/i));
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    if (
      currentGpu.name.toLowerCase().includes('intel') ||
      currentGpu.name.toLowerCase().includes('uhd')
    ) {
      return 2;
    }
    return 8;
  }, [currentGpu]);

  const usedVramGb = useMemo(() => {
    const baseIdle = Math.round(totalVramGb * 0.12 * 10) / 10;
    const tileFootprint =
      tileSize === 512
        ? 3.0
        : tileSize === 256
          ? 1.5
          : tileSize === 128
            ? 0.7
            : 1.2;
    if (isProcessing) {
      return Math.round((baseIdle + tileFootprint * 1.1) * 10) / 10;
    }
    return Math.round((baseIdle + tileFootprint * 0.85) * 10) / 10;
  }, [isProcessing, tileSize, totalVramGb]);

  const isOverflowing = usedVramGb > totalVramGb;
  const vramPct = Math.min(100, Math.round((usedVramGb / totalVramGb) * 100));

  const handleAutoTuneClick = () => {
    let recTile: number;
    const isIntel =
      currentGpu &&
      (currentGpu.name.toLowerCase().includes('intel') ||
        currentGpu.name.toLowerCase().includes('uhd'));
    if (isIntel) {
      recTile = 256;
    } else if (totalVramGb <= 4) {
      recTile = 256;
    } else if (totalVramGb <= 8) {
      recTile = 256;
    } else {
      recTile = 512;
    }

    handleTileSize(recTile);

    if (onAutoTune) {
      onAutoTune(
        recTile,
        `${totalVramGb}.0 GB VRAM (${isIntel ? 'Intel GPU Tuned' : 'Auto Tuned'})`
      );
    }
  };

  return (
    <div className="h-full flex flex-col border border-[var(--border-subtle)] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[var(--shadow-panel)] overflow-hidden select-none">
      <div className="h-[38px] flex-none flex items-center justify-between px-3 border-b border-[var(--border-default)]">
        <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[var(--text-muted)]">
          SETTINGS
        </span>
        <button
          onClick={onClose}
          className="w-[22px] h-[22px] flex items-center justify-center border-none rounded-[7px] bg-transparent text-[var(--text-muted)] text-[14px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <DeviceSelectorSection
          devices={devices}
          selectedGpu={selectedGpu}
          onSelectGpu={onSelectGpu}
          accentColor={accentColor}
          isOverflowing={isOverflowing}
          usedVramGb={usedVramGb}
          totalVramGb={totalVramGb}
          vramPct={vramPct}
          EASE={EASE}
        />

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
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { v: 0, label: 'AUTO' },
              { v: 128, label: '128' },
              { v: 256, label: '256' },
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
                    tileSize === t.v
                      ? isOverflowing
                        ? '#E88A80'
                        : 'var(--text-primary)'
                      : '#7E7871',
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
            {isOverflowing
              ? `Projected VRAM usage (${usedVramGb.toFixed(1)} GB) exceeds GPU memory (${totalVramGb.toFixed(1)} GB). Consider selecting 256px or 128px.`
              : tileSize === 0
                ? 'Tile size is derived automatically from GPU VRAM at job start.'
                : `Selected tile size: ${tileSize}px. Projected VRAM usage: ${usedVramGb.toFixed(1)} GB.`}
          </div>
        </div>

        <div className="p-3.5">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-2.5">
            OUTPUT DIRECTORY
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={displayOutputDir}
              onChange={(e) =>
                onSetOutputDir && onSetOutputDir(e.target.value)
              }
              placeholder="System Default"
              className="flex-1 min-w-0 px-2.5 py-2 border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] font-['Martian_Mono',monospace] text-[10px] text-[var(--text-secondary)] outline-none transition-all duration-200 focus:border-[var(--border-hover)] focus:text-[var(--text-primary)]"
            />
            <button
              onClick={onSelectOutputPath || (() => {})}
              className="flex-none px-3 border border-[var(--border-default)] rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
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

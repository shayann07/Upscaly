import { useMemo } from 'react';
import { DeviceSelectorSection } from './settings/DeviceSelectorSection';
import { TileSizeSection } from './settings/TileSizeSection';

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
  isProcessing: _isProcessing = false,
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
  const displayOutputDir = customOutputPath !== undefined ? customOutputPath : outputDir;

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
    const baseIdle = Math.round(totalVramGb * 0.08 * 10) / 10;
    let tileFootprint = 1.8;
    if (tileSize === 512) {
      tileFootprint = totalVramGb <= 6 ? 3.4 : 6.2;
    } else if (tileSize === 384) {
      tileFootprint = 4.2;
    } else if (tileSize === 256) {
      tileFootprint = 2.0;
    } else if (tileSize === 128) {
      tileFootprint = 0.8;
    } else if (tileSize === 0) {
      tileFootprint =
        totalVramGb <= 2 ? 0.8 : totalVramGb <= 4 ? 2.0 : totalVramGb <= 6 ? 4.2 : 5.8;
    }
    return Math.min(totalVramGb, Math.round((baseIdle + tileFootprint) * 10) / 10);
  }, [tileSize, totalVramGb]);

  const isOverflowing = usedVramGb > totalVramGb;
  const vramPct = Math.min(100, Math.round((usedVramGb / totalVramGb) * 100));

  const handleAutoTuneClick = () => {
    let recTile: number;
    const isIntel =
      currentGpu &&
      (currentGpu.name.toLowerCase().includes('intel') ||
        currentGpu.name.toLowerCase().includes('uhd'));
    if (isIntel || totalVramGb <= 2) {
      recTile = 128;
    } else if (totalVramGb <= 4) {
      recTile = 256;
    } else if (totalVramGb <= 6) {
      recTile = 384;
    } else {
      recTile = 512;
    }

    handleTileSize(recTile);

    if (onAutoTune) {
      onAutoTune(
        recTile,
        `${totalVramGb}.0 GB VRAM (${isIntel ? 'Intel GPU Tuned' : 'Adaptive Tuned'})`
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

        <TileSizeSection
          tileSize={tileSize}
          handleTileSize={handleTileSize}
          handleAutoTuneClick={handleAutoTuneClick}
          isOverflowing={isOverflowing}
          usedVramGb={usedVramGb}
          totalVramGb={totalVramGb}
          accentColor={accentColor}
        />

        <div className="p-3.5">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-2.5">
            OUTPUT DIRECTORY
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={displayOutputDir}
              onChange={(e) => onSetOutputDir && onSetOutputDir(e.target.value)}
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

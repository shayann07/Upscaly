import { useMemo } from 'react';
import { DeviceSelectorSection } from './settings/DeviceSelectorSection';
import { TileSizeSection } from './settings/TileSizeSection';
import { PresetSection } from './settings/PresetSection';
import { OutputFormatSection } from './settings/OutputFormatSection';
import { CustomModelsSection } from './settings/CustomModelsSection';
import { GentleModeSection } from './settings/GentleModeSection';
import { useVramProfile } from '../hooks/useVramProfile';
import { OutputFormat, QualityPreset } from '../lib/types';

export interface CustomModelsConfig {
  dir: string;
  onSelect: () => void;
  onClear: () => void;
}

export interface GentleModeConfig {
  on: boolean;
  onToggle: (on: boolean) => void;
}

/** Module scope so the default keeps a stable identity across renders. */
const NO_GENTLE_MODE: GentleModeConfig = { on: false, onToggle: () => {} };

/** Module scope so the default keeps a stable identity across renders. */
const NO_CUSTOM_MODELS: CustomModelsConfig = {
  dir: '',
  onSelect: () => {},
  onClear: () => {},
};

export interface GpuInfo {
  id: number;
  name: string;
  detail?: string;
  vram_mb?: number;
}

/**
 * The raw backend GPU list with a display fallback for `detail`. Lifted out
 * of the component so the branching does not count against its complexity
 * budget alongside the settings it actually renders.
 */
function toDeviceList(gpus?: GpuInfo[]): GpuInfo[] {
  if (!gpus) return [];
  return gpus.map((g) => ({
    id: g.id,
    name: g.name,
    detail: g.detail || 'VULKAN',
    vram_mb: g.vram_mb,
  }));
}

export interface AdvancedSettingsProps {
  selectedGpu?: number;
  gpus?: GpuInfo[];
  onSelectGpu?: (id: number) => void;
  tileSize?: number;
  onSelectTileSize?: (size: number) => void;
  /** The output factor the VRAM projection is sized against; see useVramProfile. */
  scale?: number;
  preset?: QualityPreset;
  onSelectPreset?: (preset: QualityPreset) => void;
  outputFormat?: OutputFormat;
  onSelectOutputFormat?: (format: OutputFormat) => void;
  /**
   * Grouped rather than three loose props: they are only ever supplied
   * together, and three more defaulted parameters pushed this component
   * past its complexity budget on their own.
   */
  customModels?: CustomModelsConfig;
  /** Grouped for the same complexity-budget reason as customModels. */
  gentle?: GentleModeConfig;
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
  gpus,
  onSelectGpu = () => {},
  tileSize = 0,
  onSelectTileSize = () => {},
  scale = 4,
  preset = 'balanced',
  onSelectPreset = () => {},
  outputFormat = 'png',
  onSelectOutputFormat = () => {},
  customModels = NO_CUSTOM_MODELS,
  gentle = NO_GENTLE_MODE,
  customOutputPath = '',
  onSetOutputDir,
  onSelectOutputPath,
  accentColor = 'var(--accent)',
  onClose = () => {},
  onAutoTune,
}: AdvancedSettingsProps) {
  const EASE = 'var(--ease-spring)';

  const devices = toDeviceList(gpus);
  const handleTileSize = onSelectTileSize;

  const currentGpu = useMemo(() => {
    return devices.find((g) => g.id === selectedGpu) || devices[0];
  }, [devices, selectedGpu]);

  // Query authoritative hardware profile and memory metrics from Rust engine
  const { totalVramGb, usedVramGb, autoTileSize, isOverflowing, statusMessage } = useVramProfile(
    currentGpu ? currentGpu.id : selectedGpu,
    tileSize,
    scale
  );

  // null until the backend reports real numbers -- the meter renders an
  // indeterminate state rather than a plausible-looking invented reading.
  const vramPct =
    usedVramGb === null || totalVramGb === null
      ? null
      : Math.min(100, Math.round((usedVramGb / Math.max(0.1, totalVramGb)) * 100));

  const handleAutoTuneClick = () => {
    // Nothing to tune against until the profile has arrived.
    if (autoTileSize === null || totalVramGb === null) return;
    if (onAutoTune) {
      onAutoTune(
        autoTileSize,
        `${totalVramGb.toFixed(1)} GB VRAM`
      );
    } else {
      handleTileSize(autoTileSize);
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

        <PresetSection preset={preset} onSelectPreset={onSelectPreset} accentColor={accentColor} />

        <TileSizeSection
          tileSize={tileSize}
          handleTileSize={handleTileSize}
          handleAutoTuneClick={handleAutoTuneClick}
          isOverflowing={isOverflowing}
          usedVramGb={usedVramGb}
          totalVramGb={totalVramGb}
          statusMessage={statusMessage}
          accentColor={accentColor}
        />

        <CustomModelsSection
          customModelsDir={customModels.dir}
          onSelectFolder={customModels.onSelect}
          onClearFolder={customModels.onClear}
        />

        <OutputFormatSection
          outputFormat={outputFormat}
          onSelectOutputFormat={onSelectOutputFormat}
          accentColor={accentColor}
        />

        <GentleModeSection on={gentle.on} onToggle={gentle.onToggle} accentColor={accentColor} />

        <div className="p-3.5">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-2.5">
            OUTPUT DIRECTORY
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={customOutputPath}
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

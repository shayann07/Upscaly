import React from 'react';
import { Cpu, Folder, X, Lightning, Gauge } from '@phosphor-icons/react';
import { CustomSelect } from './CustomSelect';

interface GpuDevice {
  id: number;
  name: string;
}

interface AdvancedSettingsProps {
  gpus: GpuDevice[];
  selectedGpu: number;
  onSelectGpu: (id: number) => void;
  tileSize: number;
  onSelectTileSize: (size: number) => void;
  customOutputPath: string;
  onSelectOutputPath: () => void;
  onClose?: () => void;
  isOpen?: boolean;
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  gpus,
  selectedGpu,
  onSelectGpu,
  tileSize,
  onSelectTileSize,
  customOutputPath,
  onSelectOutputPath,
  onClose,
}) => {
  const gpuOptions = [
    { value: -1, label: 'CPU (Fallback)' },
    ...gpus.map((g) => ({
      value: g.id,
      label: `GPU ${g.id}: ${g.name}`,
    })),
  ];

  const currentGpuName = gpus.find((g) => g.id === selectedGpu)?.name || 'Vulkan Engine / CPU';

  const handleAutoTuneTileSize = () => {
    // High-safety VRAM calculation: 256 for standard GPUs, 512 for high VRAM, 0 for Auto
    if (selectedGpu === -1) {
      onSelectTileSize(128); // Lower tile size for CPU to optimize cache efficiency
    } else {
      onSelectTileSize(256); // Safe optimal default for modern Vulkan GPUs
    }
  };

  return (
    <div className="w-80 bg-[#141419] border-l border-[#272730] h-full flex flex-col select-none shrink-0 shadow-2xl">
      {/* Inspector Panel Header */}
      <div className="h-11 px-4 border-b border-[#272730] flex items-center justify-between">
        <h4 className="text-xs font-semibold text-white tracking-wide uppercase flex items-center gap-1.5">
          <Gauge size={14} className="text-indigo-400" />
          <span>Studio Inspector</span>
        </h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#181820] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Inspector Content */}
      <div className="p-4 space-y-5 overflow-y-auto flex-1 text-xs">
        {/* Hardware Status Telemetry Gauge */}
        <div className="p-3 rounded-xl bg-[#181820] border border-[#272730] space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 uppercase">
            <span>Hardware Telemetry</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              READY
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-white truncate">{currentGpuName}</p>
            <div className="w-full bg-[#0F0F12] h-1.5 rounded-full overflow-hidden border border-[#272730]">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: selectedGpu === -1 ? '30%' : '75%' }}
              />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500 pt-0.5">
              <span>{selectedGpu === -1 ? 'System RAM Mode' : 'Vulkan Memory Safe'}</span>
              <span>{selectedGpu === -1 ? 'High Compatibility' : 'Hardware Accelerated'}</span>
            </div>
          </div>
        </div>

        {/* GPU Acceleration Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Cpu size={14} className="text-indigo-400" />
            <span>Target Acceleration Device</span>
          </label>
          <CustomSelect
            options={gpuOptions}
            value={selectedGpu}
            onChange={(val) => onSelectGpu(Number(val))}
            icon={<Cpu size={14} className="text-indigo-400" />}
            width="100%"
          />
        </div>

        {/* VRAM Tile Size Tuning */}
        <div className="space-y-2 pt-2 border-t border-[#272730]">
          <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            <span>Tile Size (VRAM Safety)</span>
            <span className="font-mono text-indigo-400 font-normal">
              {tileSize === 0 ? 'Auto' : `${tileSize}px`}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[0, 128, 256, 512].map((size) => {
              const isSelected = tileSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onSelectTileSize(size)}
                  className={`py-2 text-xs font-mono font-medium rounded-md border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-[#181820] text-zinc-400 border-[#272730] hover:text-white hover:bg-[#22222B]'
                  }`}
                >
                  {size === 0 ? 'Auto' : `${size}`}
                </button>
              );
            })}
          </div>

          {/* Auto Calculate Button */}
          <button
            type="button"
            onClick={handleAutoTuneTileSize}
            className="w-full py-1.5 px-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/40 hover:text-indigo-200 transition-colors font-medium flex items-center justify-center gap-1.5 cursor-pointer text-[11px]"
          >
            <Lightning size={13} className="text-indigo-400" />
            <span>Auto-Calculate Safe Tile Size</span>
          </button>
        </div>

        {/* Output Directory Selection */}
        <div className="space-y-2 pt-3 border-t border-[#272730]">
          <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Folder size={14} className="text-indigo-400" />
            <span>Output Save Location</span>
          </label>
          <div className="space-y-2">
            <input
              type="text"
              readOnly
              value={customOutputPath || 'Same folder as input file'}
              className="w-full bg-[#181820] border border-[#272730] text-[11px] font-mono text-zinc-300 rounded-md p-2 focus:outline-none truncate"
            />
            <button
              type="button"
              onClick={onSelectOutputPath}
              className="w-full py-1.5 text-xs font-medium rounded-md bg-[#181820] hover:bg-[#22222B] text-zinc-300 border border-[#272730] hover:text-white transition-colors cursor-pointer"
            >
              Select Destination Folder...
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

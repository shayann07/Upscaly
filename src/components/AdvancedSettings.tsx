import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, Cpu, SlidersHorizontal, Folder } from '@phosphor-icons/react';

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
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  gpus,
  selectedGpu,
  onSelectGpu,
  tileSize,
  onSelectTileSize,
  customOutputPath,
  onSelectOutputPath,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl liquid-glass border border-[#D2C3F6]/15 overflow-hidden select-none">
      {/* Header Accordion Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3.5 flex items-center justify-between text-xs font-bold text-[#F1FEC8] hover:bg-[#36255C]/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-[#D2C3F6]" />
          <span>Advanced Hardware Settings</span>
        </div>
        <CaretDown
          size={14}
          className={`text-[#D2C3F6] transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Collapsible Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-[#D2C3F6]/10 p-4 space-y-4 bg-[#16141D]/60"
          >
            {/* GPU Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#D2C3F6]/70 flex items-center gap-1.5">
                <Cpu size={14} />
                <span>Target GPU Acceleration</span>
              </label>
              <select
                value={selectedGpu}
                onChange={(e) => onSelectGpu(Number(e.target.value))}
                className="w-full bg-[#23212C] border border-[#D2C3F6]/20 text-xs text-[#F1FEC8] rounded-xl p-2.5 focus:outline-none cursor-pointer"
              >
                {gpus.length === 0 ? (
                  <option value={0}>Auto / Default Vulkan GPU</option>
                ) : (
                  gpus.map((g) => (
                    <option key={g.id} value={g.id} className="bg-[#16141D]">
                      GPU {g.id}: {g.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Tile Size (VRAM Control) */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-[#D2C3F6]/70">
                <span>VRAM Tile Size</span>
                <span className="font-mono text-[#F1FEC8]">
                  {tileSize === 0 ? 'Auto (Recommended)' : `${tileSize}px`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 128, 256, 512].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onSelectTileSize(size)}
                    className={`py-1.5 text-[10px] font-mono font-bold rounded-lg border transition-all ${
                      tileSize === size
                        ? 'bg-[#36255C] text-[#F1FEC8] border-[#D2C3F6]/40'
                        : 'bg-[#23212C]/60 text-[#D2C3F6]/50 border-[#D2C3F6]/10 hover:text-[#D2C3F6]'
                    }`}
                  >
                    {size === 0 ? 'Auto' : `${size}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Output Folder */}
            <div className="space-y-1.5 pt-1 border-t border-[#D2C3F6]/10">
              <label className="text-[11px] font-bold text-[#D2C3F6]/70 flex items-center gap-1.5">
                <Folder size={14} />
                <span>Output Destination</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={customOutputPath || 'Same directory as input file'}
                  className="flex-1 bg-[#23212C] border border-[#D2C3F6]/20 text-[11px] font-mono text-[#D2C3F6]/80 rounded-xl p-2 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onSelectOutputPath}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-[#36255C] text-[#F1FEC8] border border-[#D2C3F6]/30 hover:bg-[#4A3078] transition-colors"
                >
                  Choose
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

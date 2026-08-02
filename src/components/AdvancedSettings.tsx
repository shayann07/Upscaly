import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, Cpu, SlidersHorizontal, Folder } from '@phosphor-icons/react';
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

  const gpuOptions = gpus.length === 0
    ? [{ value: 0, label: 'Auto / Default Vulkan GPU' }]
    : gpus.map((g) => ({
        value: g.id,
        label: `GPU ${g.id}: ${g.name}`,
      }));

  return (
    <div className="rounded-3xl liquid-glass border border-[#D2C3F6]/20 overflow-hidden select-none shadow-xl backdrop-blur-2xl">
      {/* Header Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-xs font-bold text-[#F1FEC8] hover:bg-[#36255C]/40 transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal size={18} className="text-[#D2C3F6] group-hover:text-[#F1FEC8] transition-colors" />
          <span>Advanced Hardware Settings</span>
        </div>
        <CaretDown
          size={16}
          className={`text-[#D2C3F6] transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-[#F1FEC8]' : ''
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
            className="overflow-hidden border-t border-[#D2C3F6]/15 p-5 space-y-4 bg-[#16141D]/70"
          >
            {/* Custom GPU Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#D2C3F6]/80 flex items-center gap-1.5 uppercase tracking-wider">
                <Cpu size={14} />
                <span>Target GPU Acceleration</span>
              </label>
              <CustomSelect
                options={gpuOptions}
                value={selectedGpu}
                onChange={(val) => onSelectGpu(Number(val))}
                icon={<Cpu size={15} className="text-[#F1FEC8]" />}
              />
            </div>

            {/* Tile Size (VRAM Control) */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-bold text-[#D2C3F6]/80 uppercase tracking-wider">
                <span>VRAM Tile Size</span>
                <span className="font-mono text-[#F1FEC8] normal-case">
                  {tileSize === 0 ? 'Auto (Recommended)' : `${tileSize}px Tiles`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 128, 256, 512].map((size) => {
                  const isSelected = tileSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onSelectTileSize(size)}
                      className={`py-2 text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#36255C] to-[#5E3C98] text-[#F1FEC8] border-[#F1FEC8]/50 shadow-md scale-[1.02]'
                          : 'bg-[#23212C]/60 text-[#D2C3F6]/50 border-[#D2C3F6]/15 hover:text-[#F1FEC8] hover:bg-[#23212C]/90'
                      }`}
                    >
                      {size === 0 ? 'Auto' : `${size}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Output Folder */}
            <div className="space-y-2 pt-2 border-t border-[#D2C3F6]/15">
              <label className="text-[11px] font-bold text-[#D2C3F6]/80 flex items-center gap-1.5 uppercase tracking-wider">
                <Folder size={14} />
                <span>Output Destination</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={customOutputPath || 'Same directory as input file'}
                  className="flex-1 bg-[#23212C]/80 border border-[#D2C3F6]/20 text-[11px] font-mono text-[#D2C3F6]/90 rounded-xl p-2.5 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onSelectOutputPath}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#36255C] to-[#4A3078] hover:from-[#4A3078] hover:to-[#5E3C98] text-[#F1FEC8] border border-[#D2C3F6]/30 shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
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

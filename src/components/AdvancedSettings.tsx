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
    <div className="bg-[#16141D]/40 rounded-3xl border border-white/5 overflow-hidden select-none shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-3xl transition-all duration-300">
      {/* Header Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-xs font-bold text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
            <SlidersHorizontal size={14} className="text-emerald-400 group-hover:text-emerald-300 transition-colors" />
          </div>
          <span>Advanced Hardware Settings</span>
        </div>
        <CaretDown
          size={16}
          className={`text-white/40 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-white' : ''
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
            className="overflow-hidden border-t border-white/5 bg-black/20"
          >
            <div className="p-6 space-y-6">
              {/* Custom GPU Selector */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-white/50 flex items-center gap-1.5 uppercase tracking-widest">
                  <Cpu size={14} />
                  <span>Target GPU Acceleration</span>
                </label>
                <CustomSelect
                  options={gpuOptions}
                  value={selectedGpu}
                  onChange={(val) => onSelectGpu(Number(val))}
                  icon={<Cpu size={15} className="text-emerald-400" />}
                  width="100%"
                />
              </div>

              {/* Tile Size (VRAM Control) */}
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold text-white/50 uppercase tracking-widest">
                  <span>VRAM Tile Size</span>
                  <span className="font-mono text-emerald-400 normal-case">
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
                        className={`relative group py-2.5 text-xs font-mono font-bold rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                          isSelected
                            ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-900/40 text-emerald-50 border-emerald-500/50 shadow-[0_0_15px_rgba(52,211,153,0.2)]'
                            : 'bg-black/40 text-white/40 border-white/5 hover:text-white hover:bg-white/10 hover:border-white/10'
                        }`}
                      >
                         {/* Hover gradient sweep */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                        {size === 0 ? 'Auto' : `${size}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Output Folder */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <label className="text-[10px] font-bold text-white/50 flex items-center gap-1.5 uppercase tracking-widest">
                  <Folder size={14} />
                  <span>Output Destination</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={customOutputPath || 'Same directory as input file'}
                    className="flex-1 bg-black/40 border border-white/5 text-[11px] font-mono text-white/60 rounded-xl p-3 focus:outline-none shadow-inner truncate"
                  />
                  <button
                    type="button"
                    onClick={onSelectOutputPath}
                    className="h-[42px] px-5 text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 shadow-sm transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-95 cursor-pointer shrink-0"
                  >
                    Choose
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

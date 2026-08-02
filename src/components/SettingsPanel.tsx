import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Sparkle, Image as ImageIcon, Video as VideoIcon, Palette } from '@phosphor-icons/react';
import { CustomSelect } from './CustomSelect';

interface SettingsPanelProps {
  category: 'photos' | 'anime' | 'video';
  onSelectCategory: (cat: 'photos' | 'anime' | 'video') => void;
  installedModels: string[];
  selectedModel: string;
  onSelectModel: (m: string) => void;
  scale: number;
  onSelectScale: (s: number) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  category,
  onSelectCategory,
  installedModels,
  selectedModel,
  onSelectModel,
  scale,
  onSelectScale,
}) => {
  const categories = [
    { id: 'photos', label: 'Photos', icon: <ImageIcon size={14} weight="duotone" /> },
    { id: 'anime', label: 'Anime & Art', icon: <Palette size={14} weight="duotone" /> },
    { id: 'video', label: 'Video', icon: <VideoIcon size={14} weight="duotone" /> },
  ] as const;

  const modelOptions = installedModels.map((m) => ({
    value: m,
    label: m,
    sublabel: m.includes('anime') ? 'Optimized for 2D Art & Anime' : 'Photorealistic ESRGAN Model',
  }));

  return (
    <div className="space-y-6 select-none bg-[#16141D]/40 rounded-3xl border border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-3xl relative overflow-hidden">
      {/* Subtle glowing accent inside the card */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />

      {/* Category Tabs */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/50 flex items-center justify-between">
          <span>Preset Category</span>
          <span className="text-emerald-400 font-mono capitalize">{category} Mode</span>
        </label>
        <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 relative shadow-inner">
          {categories.map((cat) => {
            const isActive = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all z-10 cursor-pointer rounded-xl ${
                  isActive ? 'text-white drop-shadow-md' : 'text-white/40 hover:text-white/80'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-category"
                    className="absolute inset-y-1 rounded-xl bg-gradient-to-b from-purple-500/80 to-purple-700/80 shadow-[0_0_12px_rgba(168,85,247,0.4)] border border-purple-400/30 -z-10"
                    style={{ width: 'calc(33.333% - 5px)', left: cat.id === 'photos' ? '4px' : cat.id === 'anime' ? 'calc(33.333% + 2px)' : 'calc(66.666%)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                {cat.icon}
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          AI Model Weights
        </label>
        <CustomSelect
          options={modelOptions}
          value={selectedModel}
          onChange={(val) => onSelectModel(String(val))}
          placeholder={installedModels.length === 0 ? 'No Models Installed' : 'Select AI Model...'}
          icon={<Cpu size={16} className="text-purple-400" />}
          width="100%"
        />
      </div>

      {/* Scale Factor */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          Resolution Multiplier
        </label>
        <div className="grid grid-cols-3 gap-3">
          {[2, 3, 4].map((s) => {
            const isSelected = scale === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelectScale(s)}
                className={`relative group overflow-hidden py-3 text-sm font-bold rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
                  isSelected
                    ? 'bg-gradient-to-b from-purple-500/20 to-purple-900/40 text-white border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                    : 'bg-black/20 text-white/40 border-white/5 hover:text-white hover:bg-white/5 hover:border-white/10'
                }`}
              >
                {/* Hover gradient sweep */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                
                {isSelected && (
                  <Sparkle size={14} weight="fill" className="text-purple-300 animate-pulse drop-shadow-[0_0_5px_rgba(216,180,254,0.8)]" />
                )}
                <span>{s}x <span className={isSelected ? 'text-purple-200/80 font-medium text-xs' : 'text-white/30 font-medium text-xs'}>Scale</span></span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

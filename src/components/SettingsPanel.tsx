import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Sparkle } from '@phosphor-icons/react';
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
    { id: 'photos', label: 'Photos' },
    { id: 'anime', label: 'Anime & Art' },
    { id: 'video', label: 'Video' },
  ] as const;

  const modelOptions = installedModels.map((m) => ({
    value: m,
    label: m,
    sublabel: m.includes('anime') ? 'Optimized for 2D Art & Anime' : 'Photorealistic ESRGAN Model',
  }));

  return (
    <div className="space-y-5 select-none rounded-3xl liquid-glass border border-[#D2C3F6]/20 p-5 shadow-2xl backdrop-blur-2xl">
      {/* Category Tabs with Framer Motion sliding pill indicator */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#D2C3F6]/80 flex items-center justify-between">
          <span>Preset Category</span>
          <span className="text-[10px] text-[#F1FEC8] font-mono capitalize">{category} Mode</span>
        </label>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#16141D]/90 border border-[#D2C3F6]/15 relative">
          {categories.map((cat) => {
            const isActive = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className={`relative py-2.5 text-xs font-bold transition-all z-10 cursor-pointer ${
                  isActive ? 'text-[#F1FEC8] drop-shadow-md' : 'text-[#D2C3F6]/60 hover:text-[#D2C3F6]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-category-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#36255C] via-[#4A3078] to-[#5E3C98] border border-[#D2C3F6]/40 shadow-lg shadow-[#36255C]/60 -z-10"
                  />
                )}
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model Selection Dropdown (Custom Glass Select) */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#D2C3F6]/80">
          AI Model Weights
        </label>
        <CustomSelect
          options={modelOptions}
          value={selectedModel}
          onChange={(val) => onSelectModel(String(val))}
          placeholder={installedModels.length === 0 ? 'No Models Installed' : 'Select AI Model...'}
          icon={<Cpu size={16} className="text-[#F1FEC8]" />}
        />
      </div>

      {/* Scale Factor Buttons (2x, 3x, 4x) */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#D2C3F6]/80">
          Resolution Multiplier
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {[2, 3, 4].map((s) => {
            const isSelected = scale === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelectScale(s)}
                className={`relative py-3 text-xs font-bold rounded-2xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#36255C] via-[#4A3078] to-[#5E3C98] text-[#F1FEC8] border-[#F1FEC8]/50 shadow-xl shadow-[#36255C]/60 scale-[1.02]'
                    : 'bg-[#23212C]/60 text-[#D2C3F6]/60 border-[#D2C3F6]/15 hover:text-[#F1FEC8] hover:bg-[#23212C]/90 hover:border-[#D2C3F6]/30'
                }`}
              >
                {isSelected && <Sparkle size={12} weight="fill" className="text-[#F1FEC8] animate-spin" />}
                <span>{s}x Scale</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

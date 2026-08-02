import React from 'react';

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

  return (
    <div className="space-y-5 select-none">
      {/* Category Tabs with Framer Motion sliding selection indicator */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#D2C3F6]/70">
          Preset Category
        </label>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#16141D]/80 border border-[#D2C3F6]/15 relative">
          {categories.map((cat) => {
            const isActive = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`relative py-2 text-xs font-bold transition-colors z-10 ${
                  isActive ? 'text-[#F1FEC8]' : 'text-[#D2C3F6]/60 hover:text-[#D2C3F6]'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#36255C] to-[#4A3078] border border-[#D2C3F6]/30 shadow-md -z-10"
                  />
                )}
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model Selection Dropdown */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#D2C3F6]/70">
          AI Model Weights
        </label>
        <select
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          className="w-full bg-[#23212C] border border-[#D2C3F6]/20 text-xs font-medium text-[#F1FEC8] rounded-xl p-3 focus:outline-none focus:border-[#D2C3F6]/50 cursor-pointer shadow-inner"
        >
          {installedModels.length === 0 ? (
            <option value="">No Models Installed</option>
          ) : (
            installedModels.map((m) => (
              <option key={m} value={m} className="bg-[#16141D] text-[#F1FEC8]">
                {m}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Scale Factor Buttons (2x, 3x, 4x) */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#D2C3F6]/70">
          Resolution Multiplier
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[2, 3, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelectScale(s)}
              className={`py-2.5 text-xs font-bold rounded-xl border transition-all ${
                scale === s
                  ? 'bg-gradient-to-r from-[#36255C] to-[#4A3078] text-[#F1FEC8] border-[#D2C3F6]/50 shadow-lg shadow-[#36255C]/40 scale-[1.02]'
                  : 'bg-[#23212C]/60 text-[#D2C3F6]/60 border-[#D2C3F6]/10 hover:text-[#D2C3F6] hover:bg-[#23212C]'
              }`}
            >
              {s}x Scale
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

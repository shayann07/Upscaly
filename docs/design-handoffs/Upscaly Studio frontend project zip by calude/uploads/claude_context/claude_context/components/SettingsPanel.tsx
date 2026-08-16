import React from 'react';
import { Cpu, Image as ImageIcon, Video as VideoIcon, Palette } from '@phosphor-icons/react';
import { CustomSelect } from './CustomSelect';
import { getModelMetadata, filterModelsByCategory, findBestModelForScale } from '../lib/models';

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
    { id: 'photos', label: 'Photos', icon: <ImageIcon size={14} /> },
    { id: 'anime', label: 'Anime & Art', icon: <Palette size={14} /> },
    { id: 'video', label: 'Video', icon: <VideoIcon size={14} /> },
  ] as const;

  // Filter models relevant to active category tab
  const filteredModelIds = filterModelsByCategory(installedModels, category);

  const modelOptions = filteredModelIds.map((id) => {
    const meta = getModelMetadata(id);
    return {
      value: id,
      label: meta.name,
      sublabel: meta.description,
    };
  });

  const handleCategoryChange = (newCat: 'photos' | 'anime' | 'video') => {
    onSelectCategory(newCat);
    // Auto-select best matching model in the new category
    const bestModel = findBestModelForScale(installedModels, newCat, scale);
    if (bestModel) {
      onSelectModel(bestModel);
      const meta = getModelMetadata(bestModel);
      onSelectScale(meta.scale);
    }
  };

  const handleModelChange = (modelId: string) => {
    onSelectModel(modelId);
    // Auto-sync scale to model's native scale
    const meta = getModelMetadata(modelId);
    onSelectScale(meta.scale);
  };

  const handleScaleChange = (newScale: number) => {
    onSelectScale(newScale);
    // Auto-select model matching new scale if available in active category
    const matchingModel = findBestModelForScale(installedModels, category, newScale);
    if (matchingModel) {
      onSelectModel(matchingModel);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-[#141419] border border-[#272730] rounded-xl p-2 shadow-xl select-none">
      {/* Category Tabs */}
      <div className="flex bg-[#181820] p-0.5 rounded-lg border border-[#272730]">
        {categories.map((cat) => {
          const isActive = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#22222B]'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-6 w-[1px] bg-[#272730]" />

      {/* Model Dropdown (Opens Upwards for Bottom Dock) */}
      <div className="min-w-[210px]">
        <CustomSelect
          options={modelOptions}
          value={selectedModel}
          onChange={(val) => handleModelChange(String(val))}
          placeholder={filteredModelIds.length === 0 ? 'No Models' : 'Select Model...'}
          icon={<Cpu size={14} className="text-indigo-400" />}
          width="100%"
          dropDirection="up"
        />
      </div>

      <div className="h-6 w-[1px] bg-[#272730]" />

      {/* Scale Factor Pills */}
      <div className="flex items-center gap-1">
        {[2, 3, 4].map((s) => {
          const isSelected = scale === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => handleScaleChange(s)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                isSelected
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-[#181820] text-zinc-400 border-[#272730] hover:text-white hover:bg-[#22222B]'
              }`}
            >
              <span>{s}x</span>
              <span className="text-[10px] opacity-70 font-normal">Scale</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

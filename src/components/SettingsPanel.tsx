import { useState } from 'react';
import { SUPPORTED_MODELS, ModelInfo } from '../lib/types';
import { ModelSelectorDropdown } from './settings/ModelSelectorDropdown';

interface SettingsPanelProps {
  supportedModels?: ModelInfo[];
  modelCategory?: 'photo' | 'anime' | 'video';
  onSetCategory?: (cat: 'photo' | 'anime' | 'video') => void;
  category?: 'photos' | 'anime' | 'video';
  onSelectCategory?: (cat: 'photos' | 'anime' | 'video') => void;
  selectedModel: string;
  onSelectModel: (id: string) => void;
  selectedScale?: number;
  scale?: number;
  onSelectScale: (s: number) => void;
  isProcessing?: boolean;
  hasFiles?: boolean;
  isBatchMode?: boolean;
  onRun?: () => void;
  onCancel?: () => void;
  onOpenCatalog?: () => void;
  accentColor?: string;
  installedModels?: string[];
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function SettingsPanel({
  supportedModels,
  modelCategory = 'photo',
  onSetCategory,
  category = 'photos',
  onSelectCategory,
  selectedModel,
  onSelectModel,
  selectedScale,
  scale = 4,
  onSelectScale,
  isProcessing = false,
  hasFiles = true,
  isBatchMode = false,
  onRun = () => {},
  onCancel: _onCancel = () => {},
  onOpenCatalog = () => {},
  accentColor = 'var(--accent)',
}: SettingsPanelProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const activeCategory =
    category === 'photos'
      ? 'photo'
      : category === 'anime'
        ? 'anime'
        : category === 'video'
          ? 'video'
          : modelCategory;
  const activeScale = selectedScale !== undefined ? selectedScale : scale;

  const modelsList =
    supportedModels && supportedModels.length > 0
      ? supportedModels
      : SUPPORTED_MODELS;

  const handleCategory = (cat: 'photo' | 'anime' | 'video') => {
    if (onSetCategory) onSetCategory(cat);
    if (onSelectCategory) {
      const altCat = cat === 'photo' ? 'photos' : cat;
      onSelectCategory(altCat);
    }
    const catModels = modelsList.filter((m: ModelInfo) => m.cat === cat);
    if (
      catModels.length > 0 &&
      !catModels.some((m) => m.id === selectedModel)
    ) {
      onSelectModel(catModels[0].id);
    }
  };

  const big = isHovered;
  const EASE = 'var(--ease-spring)';

  const model =
    modelsList.find((m: ModelInfo) => m.id === selectedModel) ||
    modelsList[0] ||
    SUPPORTED_MODELS[0];
  const filteredModels = modelsList.filter(
    (m: ModelInfo) => m.cat === activeCategory
  );

  const pill = (active: boolean, isBig: boolean) => ({
    height: isBig ? 32 : 26,
    padding: `0 ${isBig ? 14 : 11}px`,
    borderRadius: 10,
    border: `1px solid ${active ? accentColor : 'transparent'}`,
    background: active ? 'var(--accent-bg)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-dim)',
    fontFamily: 'Archivo, sans-serif',
    fontSize: isBig ? '12.5px' : '11.5px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    whiteSpace: 'nowrap' as const,
    transition: `all .22s ${EASE}`,
  });

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={{
        gap: big ? 8 : 6,
        padding: big ? 6 : 5,
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        background: 'rgba(13,12,11,.96)',
        boxShadow: `0 ${big ? 22 : 14}px ${big ? 50 : 34}px rgba(0,0,0,.6)`,
      }}
    >
      <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
        <button
          onClick={() => handleCategory('photo')}
          style={pill(activeCategory === 'photo', big)}
          className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          Photo
        </button>
        <button
          onClick={() => handleCategory('anime')}
          style={pill(activeCategory === 'anime', big)}
          className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          Anime
        </button>
        <button
          onClick={() => handleCategory('video')}
          style={pill(activeCategory === 'video', big)}
          className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          Video
        </button>
      </div>

      <ModelSelectorDropdown
        big={big}
        EASE={EASE}
        model={model}
        modelMenuOpen={modelMenuOpen}
        setModelMenuOpen={setModelMenuOpen}
        filteredModels={filteredModels}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        onOpenCatalog={onOpenCatalog}
        accentColor={accentColor}
      />

      <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
        <button
          onClick={() => onSelectScale(2)}
          style={pill(activeScale === 2, big)}
          className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          2×
        </button>
        <button
          onClick={() => onSelectScale(3)}
          style={pill(activeScale === 3, big)}
          className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          3×
        </button>
        <button
          onClick={() => onSelectScale(4)}
          style={pill(activeScale === 4, big)}
          className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          4×
        </button>
      </div>

      <button
        disabled={isProcessing || !hasFiles}
        onClick={onRun}
        className="flex-none flex items-center gap-2 font-['Archivo',sans-serif] font-semibold whitespace-nowrap transition-all duration-200 hover:scale-[1.05] hover:shadow-[0_4px_16px_rgba(255,255,255,0.25)]"
        style={{
          height: big ? 36 : 30,
          padding: `0 ${big ? 18 : 14}px`,
          border: 'none',
          borderRadius: 11,
          background: isProcessing
            ? '#1B1917'
            : hasFiles
              ? 'var(--text-primary)'
              : '#1B1917',
          color: isProcessing
            ? 'var(--text-dim)'
            : hasFiles
              ? 'var(--bg-base)'
              : 'var(--text-dim)',
          fontSize: big ? '13px' : '12px',
          cursor: hasFiles && !isProcessing ? 'pointer' : 'not-allowed',
        }}
      >
        <span>
          {isProcessing ? 'Processing...' : isBatchMode ? 'Run queue' : 'Upscale'}
        </span>
        {big && !isProcessing && (
          <span className="font-['Martian_Mono',monospace] text-[9px] opacity-50 tracking-[0.04em]">
            ⌘↩
          </span>
        )}
      </button>
    </div>
  );
}

export default SettingsPanel;

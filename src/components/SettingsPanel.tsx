import { useState } from 'react';
import { SUPPORTED_MODELS, ModelInfo } from '../lib/types';
import { ModelSelectorDropdown } from './settings/ModelSelectorDropdown';
import { CategorySelectorSection } from './settings/CategorySelectorSection';
import { ScaleSelectorSection } from './settings/ScaleSelectorSection';

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

function resolveActiveCategory(cat?: string, modelCat?: string): 'photo' | 'anime' | 'video' {
  if (cat === 'photos') return 'photo';
  if (cat === 'anime') return 'anime';
  if (cat === 'video') return 'video';
  return (modelCat as 'photo' | 'anime' | 'video') || 'photo';
}

function getPillStyle(active: boolean, isBig: boolean, accentColor: string, ease: string) {
  return {
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
    transition: `all .22s ${ease}`,
  };
}

function getModelListData(
  supportedModels: ModelInfo[] | undefined,
  selectedModel: string,
  activeCategory: string
) {
  const modelsList =
    supportedModels && supportedModels.length > 0 ? supportedModels : SUPPORTED_MODELS;
  const model =
    modelsList.find((m: ModelInfo) => m.id === selectedModel) ||
    modelsList[0] ||
    SUPPORTED_MODELS[0];
  const filteredModels =
    activeCategory === 'video'
      ? modelsList
      : modelsList.filter((m: ModelInfo) => m.cat === activeCategory);
  return { modelsList, model, filteredModels };
}

function getRunButtonStyle(
  isHovered: boolean,
  isProcessing: boolean,
  hasFiles: boolean
): React.CSSProperties {
  return {
    height: isHovered ? 36 : 30,
    padding: `0 ${isHovered ? 18 : 14}px`,
    border: 'none',
    borderRadius: 11,
    background: isProcessing ? '#1B1917' : hasFiles ? 'var(--text-primary)' : '#1B1917',
    color: isProcessing ? 'var(--text-dim)' : hasFiles ? 'var(--bg-base)' : 'var(--text-dim)',
    fontSize: isHovered ? '13px' : '12px',
    cursor: hasFiles && !isProcessing ? 'pointer' : 'not-allowed',
  };
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
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
    onOpenCatalog = () => {},
    accentColor = 'var(--accent)',
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const activeCategory = resolveActiveCategory(category, modelCategory);
  const activeScale = selectedScale !== undefined ? selectedScale : scale;
  const EASE = 'var(--ease-spring)';

  const { modelsList, model, filteredModels } = getModelListData(
    supportedModels,
    selectedModel,
    activeCategory
  );

  const handleCategory = (cat: 'photo' | 'anime' | 'video') => {
    if (onSetCategory) onSetCategory(cat);
    if (onSelectCategory) {
      onSelectCategory(cat === 'photo' ? 'photos' : cat);
    }
    const catModels = modelsList.filter((m: ModelInfo) => m.cat === cat);
    if (catModels.length > 0 && !catModels.some((m) => m.id === selectedModel)) {
      onSelectModel(catModels[0].id);
    }
  };

  const pill = (active: boolean, isBig: boolean) => getPillStyle(active, isBig, accentColor, EASE);

  const runBtnStyle = getRunButtonStyle(isHovered, isProcessing, hasFiles);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={{
        gap: isHovered ? 8 : 6,
        padding: isHovered ? 6 : 5,
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        background: 'rgba(13,12,11,.96)',
        boxShadow: `0 ${isHovered ? 22 : 14}px ${isHovered ? 50 : 34}px rgba(0,0,0,.6)`,
      }}
    >
      <CategorySelectorSection
        activeCategory={activeCategory}
        big={isHovered}
        pillStyle={pill}
        handleCategory={handleCategory}
      />

      <ModelSelectorDropdown
        big={isHovered}
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

      <ScaleSelectorSection
        activeScale={activeScale}
        big={isHovered}
        pillStyle={pill}
        onSelectScale={onSelectScale}
      />

      <button
        disabled={isProcessing || !hasFiles}
        onClick={onRun}
        className="flex-none flex items-center gap-2 font-['Archivo',sans-serif] font-semibold whitespace-nowrap transition-all duration-200 hover:scale-[1.05] hover:shadow-[0_4px_16px_rgba(255,255,255,0.25)]"
        style={runBtnStyle}
      >
        <span>{isProcessing ? 'Processing...' : isBatchMode ? 'Run queue' : 'Upscale'}</span>
        {isHovered && !isProcessing && (
          <span className="font-['Martian_Mono',monospace] text-[9px] opacity-50 tracking-[0.04em]">
            ⌘↩
          </span>
        )}
      </button>
    </div>
  );
}

export default SettingsPanel;

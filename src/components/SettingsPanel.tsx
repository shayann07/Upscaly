import { memo, useState } from 'react';
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

function getPillStyle(active: boolean, accentColor: string, ease: string) {
  return {
    height: 28,
    padding: '0 12px',
    borderRadius: 9,
    border: `1px solid ${active ? accentColor : 'transparent'}`,
    background: active ? 'var(--accent-bg)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-dim)',
    fontFamily: 'Archivo, sans-serif',
    fontSize: '11.5px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    whiteSpace: 'nowrap' as const,
    transition: `background-color .24s ${ease}, color .24s ${ease}, border-color .24s ${ease}`,
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

function getRunButtonStyle(isProcessing: boolean, hasFiles: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: '0 16px',
    border: 'none',
    borderRadius: 10,
    background: isProcessing ? '#1B1917' : hasFiles ? 'var(--text-primary)' : '#1B1917',
    color: isProcessing ? 'var(--text-dim)' : hasFiles ? 'var(--bg-base)' : 'var(--text-dim)',
    fontSize: '12px',
    cursor: hasFiles && !isProcessing ? 'pointer' : 'not-allowed',
    transition: 'background-color .24s ease, opacity .24s ease, box-shadow .24s ease',
  };
}

function selectCategoryModel(
  cat: 'photo' | 'anime' | 'video',
  modelsList: ModelInfo[],
  selectedModel: string,
  onSelectModel: (id: string) => void
) {
  const catModels = modelsList.filter((m: ModelInfo) => m.cat === cat);
  if (catModels.length > 0 && !catModels.some((m) => m.id === selectedModel)) {
    onSelectModel(catModels[0].id);
  }
}

function getRunButtonLabel(isProcessing: boolean, isBatchMode: boolean): string {
  if (isProcessing) return 'Processing...';
  return isBatchMode ? 'Run queue' : 'Upscale';
}

function SettingsPanelImpl(props: SettingsPanelProps) {
  const {
    supportedModels,
    modelCategory,
    onSetCategory,
    category,
    onSelectCategory,
    selectedModel,
    onSelectModel,
    selectedScale,
    scale,
    onSelectScale,
    isProcessing = false,
    hasFiles = true,
    isBatchMode = false,
    onRun,
    onOpenCatalog = () => {},
    accentColor = 'var(--accent)',
    installedModels = [],
  } = props;

  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const activeCategory = resolveActiveCategory(category, modelCategory);
  const activeScale = selectedScale ?? scale ?? 4;
  const EASE = 'var(--ease-spring)';

  const { modelsList, model, filteredModels } = getModelListData(
    supportedModels,
    selectedModel,
    activeCategory
  );

  const handleCategory = (cat: 'photo' | 'anime' | 'video') => {
    onSetCategory?.(cat);
    onSelectCategory?.(cat === 'photo' ? 'photos' : cat);
    selectCategoryModel(cat, modelsList, selectedModel, onSelectModel);
  };

  const pill = (active: boolean) => getPillStyle(active, accentColor, EASE);
  const runBtnStyle = getRunButtonStyle(isProcessing, hasFiles);
  const runLabel = getRunButtonLabel(isProcessing, isBatchMode);

  return (
    <div
      className="flex items-center transition-all duration-300 hover:border-[var(--border-hover)]"
      style={{
        gap: 6,
        padding: 5,
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        background: 'rgba(13,12,11,.96)',
        boxShadow: '0 16px 40px rgba(0,0,0,.6)',
      }}
    >
      <CategorySelectorSection
        activeCategory={activeCategory}
        pillStyle={pill}
        handleCategory={handleCategory}
      />

      <ModelSelectorDropdown
        model={model}
        modelMenuOpen={modelMenuOpen}
        setModelMenuOpen={setModelMenuOpen}
        filteredModels={filteredModels}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        onOpenCatalog={onOpenCatalog}
        accentColor={accentColor}
        installedModels={installedModels}
      />

      <ScaleSelectorSection
        activeScale={activeScale}
        pillStyle={pill}
        onSelectScale={onSelectScale}
      />

      <button
        disabled={isProcessing || !hasFiles}
        onClick={onRun}
        className="flex-none flex items-center gap-2 font-['Archivo',sans-serif] font-semibold whitespace-nowrap transition-all duration-200 hover:opacity-95 hover:shadow-[0_2px_12px_rgba(255,255,255,0.18)]"
        style={runBtnStyle}
      >
        <span>{runLabel}</span>
        {!isProcessing && (
          <span className="font-['Martian_Mono',monospace] text-[9px] opacity-40 tracking-[0.04em]">
            ⌘↩
          </span>
        )}
      </button>
    </div>
  );
}

export const SettingsPanel = memo(SettingsPanelImpl);

export default SettingsPanel;

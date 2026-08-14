import { GpuInfo } from '../lib/types';
import { WindowControls } from './titlebar/WindowControls';
import { TitlebarNav } from './titlebar/TitlebarNav';
import { TitlebarGpuIsland } from './titlebar/TitlebarGpuIsland';
import { TitlebarFileChip } from './titlebar/TitlebarFileChip';

interface TitlebarProps {
  hasFiles?: boolean;
  currentFile?: string | null;
  originalDims?: { w: number; h: number } | null;
  outputDims?: { w: number; h: number } | null;
  isDone?: boolean;
  selectedGpu?: number;
  availableGpus?: GpuInfo[];
  onSelectGpu?: (gpuId: number) => void;
  isVramOverflowing?: boolean;
  activeNavTab?: 'models' | 'history' | 'settings' | 'about' | null;
  onToggleNavTab?: (tab: 'models' | 'history' | 'settings' | 'about') => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  onOpenCatalog?: () => void;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  isProcessing?: boolean;
  onRemoveFile?: () => void;
  accentColor?: string;
  onShowModelCatalog?: () => void;
  onShowSettings?: () => void;
  onShowAbout?: () => void;
  onShowHistory?: () => void;
  onToggleInspector?: () => void;
  isInspectorOpen?: boolean;
}

function getTitlebarHandlers(p: TitlebarProps) {
  return {
    handleCatalog: p.onOpenCatalog || p.onShowModelCatalog || (() => {}),
    handleToggleInspector:
      p.onToggleSettings || p.onToggleInspector || p.onShowSettings || (() => {}),
    handleHistory: p.onOpenHistory || p.onShowHistory || (() => {}),
    handleAbout: p.onOpenAbout || p.onShowAbout || (() => {}),
    inspectorActive: Boolean(p.activeNavTab === 'settings' || p.settingsOpen || p.isInspectorOpen),
  };
}

export function Titlebar(props: TitlebarProps) {
  const {
    hasFiles = false,
    currentFile = null,
    outputDims = null,
    isDone = false,
    isProcessing = false,
    selectedGpu = 0,
    availableGpus = [],
    onSelectGpu = () => {},
    isVramOverflowing = false,
    activeNavTab,
    onToggleNavTab,
    onRemoveFile = () => {},
    accentColor = 'var(--accent)',
  } = props;

  const { handleCatalog, handleToggleInspector, handleHistory, handleAbout, inspectorActive } =
    getTitlebarHandlers(props);

  const cleanFile = currentFile ? currentFile.split('/').pop()?.split('\\').pop() || '' : '';
  const isVid = cleanFile ? /\.(mp4|mkv|mov|avi|webm)$/i.test(cleanFile) : false;
  const kindTag = isVid ? 'VID' : 'IMG';
  const outDims = outputDims ? `${outputDims.w}×${outputDims.h}` : '';

  return (
    <header className="absolute top-0 left-0 right-0 h-14 z-[40] flex items-center justify-between px-3 select-none pointer-events-none">
      <WindowControls />

      {hasFiles ? (
        <TitlebarFileChip
          fileName={cleanFile}
          kindTag={kindTag}
          outDims={outDims}
          isDone={isDone}
          isProcessing={isProcessing}
          onRemoveFile={onRemoveFile}
        />
      ) : (
        <TitlebarGpuIsland
          selectedGpu={selectedGpu}
          availableGpus={availableGpus}
          onSelectGpu={onSelectGpu}
          isVramOverflowing={isVramOverflowing}
          accentColor={accentColor}
        />
      )}

      <TitlebarNav
        activeNavTab={activeNavTab}
        onToggleNavTab={onToggleNavTab}
        inspectorActive={inspectorActive}
        handleCatalog={handleCatalog}
        handleHistory={handleHistory}
        handleToggleInspector={handleToggleInspector}
        handleAbout={handleAbout}
      />
    </header>
  );
}

export default Titlebar;

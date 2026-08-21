import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { AdvancedSettings } from '../AdvancedSettings';
import { ModelCatalogModal } from '../ModelCatalogModal';
import { RecentHistoryDrawer } from '../RecentHistoryDrawer';
import { AboutModal } from '../AboutModal';
import { ToastContainer } from '../ToastContainer';
import { HistoryEntry } from '../../lib/types';
import {
  useActiveNavTab,
  useCustomModelsDir,
  useGentleMode,
  useCustomOutputPath,
  useDownloadingModels,
  useGpus,
  useHistoryItems,
  useInstalledModels,
  useIsProcessing,
  useOutputFormat,
  usePreset,
  useScale,
  useSelectedGpu,
  useSupportedModels,
  useTileSize,
  useToasts,
} from '../../store/selectors';
import { studioActions } from '../../store/studioStore';
import {
  clearCustomModelsDir,
  downloadModel,
  loadHistoryItem,
  selectCustomModelsDir,
  selectOutputDirectory,
} from '../../store/studioCommands';

const closeNav = () => studioActions.setActiveNavTab(null);
const handleDownloadModel = (id: string) => void downloadModel(id);
const handleSelectOutputDir = () => void selectOutputDirectory();
const handleSelectModelsDir = () => void selectCustomModelsDir();
const handleClearModelsDir = () => void clearCustomModelsDir();

function SettingsDrawerContent() {
  const gpus = useGpus();
  const selectedGpu = useSelectedGpu();
  const tileSize = useTileSize();
  const scale = useScale();
  const preset = usePreset();
  const outputFormat = useOutputFormat();
  const customModelsDir = useCustomModelsDir();
  const gentleMode = useGentleMode();
  const customOutputPath = useCustomOutputPath();
  const isProcessing = useIsProcessing();

  const customModels = useMemo(
    () => ({
      dir: customModelsDir,
      onSelect: handleSelectModelsDir,
      onClear: handleClearModelsDir,
    }),
    [customModelsDir]
  );

  const handleAutoTune = useCallback((recTile: number, vramText: string) => {
    studioActions.setTileSize(recTile);
    studioActions.notify(
      'info',
      'Auto-Tuned Tile Size',
      `Set to ${recTile === 0 ? 'AUTO' : `${recTile}px`} based on ${vramText}`
    );
  }, []);

  return (
    <AdvancedSettings
      gpus={gpus}
      selectedGpu={selectedGpu}
      onSelectGpu={(id) => {
        studioActions.setSelectedGpu(id);
        const gName = gpus.find((g) => g.id === id)?.name || `GPU ${id}`;
        studioActions.notify('info', 'GPU Selected', gName);
      }}
      tileSize={tileSize}
      onSelectTileSize={(size) => {
        studioActions.setTileSize(size);
        studioActions.notify(
          'info',
          'Tile Size Updated',
          size === 0 ? 'Tile size set to AUTO' : `Tile size set to ${size}px`
        );
      }}
      scale={scale}
      preset={preset}
      onSelectPreset={(p) => {
        studioActions.setPreset(p);
        studioActions.notify('info', 'Preset Updated', `Switched to ${p.toUpperCase()} mode`);
      }}
      outputFormat={outputFormat}
      onSelectOutputFormat={(f) => {
        studioActions.setOutputFormat(f);
        studioActions.notify(
          'info',
          'Format Updated',
          `Output container set to ${f.toUpperCase()}`
        );
      }}
      customModels={customModels}
      gentle={{
        on: gentleMode,
        onToggle: (on) => {
          studioActions.setGentleMode(on);
          studioActions.notify(
            'info',
            'Gentle Mode',
            on ? 'Enabled (reduced background thermal load)' : 'Disabled (full speed)'
          );
        },
      }}
      customOutputPath={customOutputPath}
      onSetOutputDir={studioActions.setCustomOutputPath}
      onSelectOutputPath={handleSelectOutputDir}
      isProcessing={isProcessing}
      onAutoTune={handleAutoTune}
      onClose={closeNav}
    />
  );
}

export const StudioModals = memo(function StudioModals() {
  const activeNavTab = useActiveNavTab();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeNavTab) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (target.closest('[data-nav-tab]')) return;
      if (target.closest('[data-toast-container]')) return;
      studioActions.setActiveNavTab(null);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [activeNavTab]);

  const supportedModels = useSupportedModels();
  const installedModels = useInstalledModels();
  const downloadingModels = useDownloadingModels();
  const historyItems = useHistoryItems();
  const toasts = useToasts();

  const handleSelectHistoryItem = useCallback((item: HistoryEntry) => {
    void loadHistoryItem(item);
  }, []);

  return (
    <>
      {activeNavTab && (
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            top: 56,
            right: 12,
            bottom: 78,
            width: 312,
            zIndex: 38,
            animation: 'slidein .3s var(--ease-spring) both',
          }}
        >
          {activeNavTab === 'settings' && <SettingsDrawerContent />}

          {activeNavTab === 'models' && (
            <ModelCatalogModal
              supportedModels={supportedModels}
              installedModelIds={installedModels}
              onDownloadModel={handleDownloadModel}
              downloadingModels={downloadingModels}
              onClose={closeNav}
            />
          )}

          {activeNavTab === 'history' && (
            <RecentHistoryDrawer
              history={historyItems}
              supportedModels={supportedModels}
              onSelectHistoryItem={handleSelectHistoryItem}
              onClose={closeNav}
            />
          )}

          {activeNavTab === 'about' && <AboutModal onClose={closeNav} />}
        </div>
      )}

      <ToastContainer
        toasts={toasts}
        onDismiss={studioActions.dismissToast}
        onCloseDrawer={closeNav}
      />
    </>
  );
});

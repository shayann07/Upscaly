import { memo, useCallback } from 'react';
import { AdvancedSettings } from '../AdvancedSettings';
import { ModelCatalogModal } from '../ModelCatalogModal';
import { RecentHistoryDrawer } from '../RecentHistoryDrawer';
import { AboutModal } from '../AboutModal';
import { ToastContainer } from '../ToastContainer';
import { HistoryEntry } from '../../lib/types';
import {
  useActiveNavTab,
  useCustomOutputPath,
  useDownloadProgress,
  useDownloadingModelId,
  useGpus,
  useHistoryItems,
  useInstalledModels,
  useIsProcessing,
  useSelectedGpu,
  useSupportedModels,
  useTileSize,
  useToasts,
} from '../../store/selectors';
import { studioActions } from '../../store/studioStore';
import { downloadModel, loadHistoryItem, selectOutputDirectory } from '../../store/studioCommands';

const closeNav = () => studioActions.setActiveNavTab(null);
const handleDownloadModel = (id: string) => void downloadModel(id);
const handleSelectOutputDir = () => void selectOutputDirectory();

export const StudioModals = memo(function StudioModals() {
  const activeNavTab = useActiveNavTab();
  const gpus = useGpus();
  const selectedGpu = useSelectedGpu();
  const tileSize = useTileSize();
  const customOutputPath = useCustomOutputPath();
  const isProcessing = useIsProcessing();
  const supportedModels = useSupportedModels();
  const installedModels = useInstalledModels();
  const downloadingModelId = useDownloadingModelId();
  const downloadProgress = useDownloadProgress();
  const historyItems = useHistoryItems();
  const toasts = useToasts();

  const handleAutoTune = useCallback((recTile: number, vramText: string) => {
    studioActions.setTileSize(recTile);
    studioActions.notify(
      'info',
      'Auto-Tuned Tile Size',
      `Set to ${recTile === 0 ? 'AUTO' : `${recTile}px`} based on ${vramText}`
    );
  }, []);

  const handleSelectHistoryItem = useCallback((item: HistoryEntry) => {
    loadHistoryItem(item);
  }, []);

  return (
    <>
      {activeNavTab && (
        <div
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
          {activeNavTab === 'settings' && (
            <AdvancedSettings
              gpus={gpus}
              selectedGpu={selectedGpu}
              onSelectGpu={studioActions.setSelectedGpu}
              tileSize={tileSize}
              onSelectTileSize={studioActions.setTileSize}
              customOutputPath={customOutputPath}
              onSetOutputDir={studioActions.setCustomOutputPath}
              onSelectOutputPath={handleSelectOutputDir}
              isProcessing={isProcessing}
              onAutoTune={handleAutoTune}
              onClose={closeNav}
            />
          )}

          {activeNavTab === 'models' && (
            <ModelCatalogModal
              supportedModels={supportedModels}
              installedModelIds={installedModels}
              onDownloadModel={handleDownloadModel}
              downloadingModelId={downloadingModelId}
              downloadProgress={downloadProgress}
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

      <ToastContainer toasts={toasts} onDismiss={studioActions.dismissToast} />
    </>
  );
});

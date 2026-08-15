import { AdvancedSettings } from '../AdvancedSettings';
import { ModelCatalogModal } from '../ModelCatalogModal';
import { RecentHistoryDrawer } from '../RecentHistoryDrawer';
import { AboutModal } from '../AboutModal';
import { ToastContainer, ToastItem } from '../ToastContainer';
import { GpuInfo, ModelInfo, HistoryEntry } from '../../lib/types';

interface StudioModalsProps {
  activeNavTab: 'models' | 'history' | 'settings' | 'about' | null;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
  gpus: GpuInfo[];
  selectedGpu: number;
  setSelectedGpu: (gpu: number) => void;
  tileSize: number;
  setTileSize: (size: number) => void;
  customOutputPath: string;
  setCustomOutputPath: (path: string) => void;
  handleSelectDestinationFolder: () => void;
  jobStatus: string;
  addToast: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
  supportedModels: ModelInfo[];
  installedModels: string[];
  handleDownloadModel: (id: string) => void;
  downloadingModelId: string | null;
  downloadProgress: number;
  historyItems: HistoryEntry[];
  handleLoadHistoryItem: (item: HistoryEntry) => void;
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

export function StudioModals({
  activeNavTab,
  setActiveNavTab,
  gpus,
  selectedGpu,
  setSelectedGpu,
  tileSize,
  setTileSize,
  customOutputPath,
  setCustomOutputPath,
  handleSelectDestinationFolder,
  jobStatus,
  addToast,
  supportedModels,
  installedModels,
  handleDownloadModel,
  downloadingModelId,
  downloadProgress,
  historyItems,
  handleLoadHistoryItem,
  toasts,
  removeToast,
}: StudioModalsProps) {
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
              onSelectGpu={setSelectedGpu}
              tileSize={tileSize}
              onSelectTileSize={setTileSize}
              customOutputPath={customOutputPath}
              onSetOutputDir={(dir) => setCustomOutputPath(dir)}
              onSelectOutputPath={handleSelectDestinationFolder}
              isProcessing={jobStatus === 'running' || jobStatus === 'queued'}
              onAutoTune={(recTile, vramText) => {
                setTileSize(recTile);
                addToast(
                  'info',
                  'Auto-Tuned Tile Size',
                  `Set to ${recTile === 0 ? 'AUTO' : recTile + 'px'} based on ${vramText}`
                );
              }}
              onClose={() => setActiveNavTab(null)}
            />
          )}

          {activeNavTab === 'models' && (
            <ModelCatalogModal
              supportedModels={supportedModels}
              installedModelIds={installedModels}
              onDownloadModel={handleDownloadModel}
              downloadingModelId={downloadingModelId}
              downloadProgress={downloadProgress}
              onClose={() => setActiveNavTab(null)}
            />
          )}

          {activeNavTab === 'history' && (
            <RecentHistoryDrawer
              history={historyItems}
              supportedModels={supportedModels}
              onSelectHistoryItem={(item: HistoryEntry) => {
                handleLoadHistoryItem(item);
              }}
              onClose={() => setActiveNavTab(null)}
            />
          )}

          {activeNavTab === 'about' && <AboutModal onClose={() => setActiveNavTab(null)} />}
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}

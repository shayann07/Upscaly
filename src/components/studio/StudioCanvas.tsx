import { memo, useMemo } from 'react';
import { Titlebar } from '../Titlebar';
import { BatchQueueView } from '../BatchQueueView';
import { ConfirmCancelDialog } from '../ConfirmCancelDialog';
import { StudioPreviewSection } from './StudioPreviewSection';
import { StudioControlsSection } from './StudioControlsSection';
import {
  useActiveNavTab,
  useConfirmCancelOpen,
  useConfirmSlowRunOpen,
  useResumableJobs,
  useGpus,
  useIsProcessing,
  useIsVramOverflowing,
  useItems,
  useJobStatus,
  useScale,
  useSelectedId,
  useSelectedItem,
  useSelectedGpu,
} from '../../store/selectors';
import { studioActions } from '../../store/studioStore';
import {
  cancelItem,
  clearFile,
  confirmCancelAndClear,
  confirmSlowRunAndStart,
  discardOfferedResume,
  dismissCancelConfirmation,
  dismissOfferedResume,
  dismissSlowRunConfirmation,
  resumeOfferedJob,
  openFiles,
} from '../../store/studioCommands';

const handleOpenFile = () => void openFiles();
const handleCancelItem = (id: string) => void cancelItem(id);
const handleConfirmCancel = () => void confirmCancelAndClear();
const handleConfirmSlowRun = () => void confirmSlowRunAndStart();
const handleResumeOffered = () => void resumeOfferedJob();
const handleDiscardOffered = () => void discardOfferedResume();

export const StudioCanvas = memo(function StudioCanvas({ isDragOver }: { isDragOver: boolean }) {
  const items = useItems();
  const selected = useSelectedItem();
  const selectedId = useSelectedId();
  const jobStatus = useJobStatus();
  const isProc = useIsProcessing();
  const scale = useScale();
  const gpus = useGpus();
  const selectedGpu = useSelectedGpu();
  const activeNavTab = useActiveNavTab();
  const confirmCancelOpen = useConfirmCancelOpen();
  const confirmSlowRunOpen = useConfirmSlowRunOpen();
  const resumableJobs = useResumableJobs();
  const offeredResume = resumableJobs[0];

  const isVramOverflowing = useIsVramOverflowing();

  // Derived objects are memoized rather than rebuilt inline. Titlebar is
  // memoized, and a fresh object literal in any one of these props would
  // have re-rendered it on every progress tick regardless.
  const originalDims = useMemo(
    () => (selected?.w != null && selected.h != null ? { w: selected.w, h: selected.h } : null),
    [selected?.w, selected?.h]
  );
  const outputDims = useMemo(
    () => (originalDims ? { w: originalDims.w * scale, h: originalDims.h * scale } : null),
    [originalDims, scale]
  );
  const availableGpus = useMemo(
    () =>
      gpus.map((g) => ({
        id: g.id,
        name: g.name,
        detail: g.detail || (g.id === 0 ? 'Default GPU' : 'Vulkan Device'),
      })),
    [gpus]
  );

  const currentFileDims = originalDims;

  return (
    <>
      <StudioPreviewSection isDragOver={isDragOver} />

      <Titlebar
        hasFiles={items.length > 0}
        currentFile={selected?.fileName ?? null}
        originalDims={originalDims}
        outputDims={outputDims}
        isDone={jobStatus === 'succeeded'}
        isProcessing={isProc}
        selectedGpu={selectedGpu}
        availableGpus={availableGpus}
        onSelectGpu={studioActions.setSelectedGpu}
        isVramOverflowing={isVramOverflowing}
        activeNavTab={activeNavTab}
        onToggleNavTab={studioActions.toggleNavTab}
        onRemoveFile={clearFile}
      />

      <BatchQueueView
        items={items}
        selectedId={selectedId ?? undefined}
        selectedScale={scale}
        currentFileDims={currentFileDims}
        onSelect={studioActions.selectItem}
        onAddFiles={handleOpenFile}
        onClear={clearFile}
        onRemoveItem={studioActions.removeItem}
        onCancelItem={handleCancelItem}
      />

      <StudioControlsSection />

      <ConfirmCancelDialog
        isOpen={confirmCancelOpen}
        onConfirm={handleConfirmCancel}
        onDismiss={dismissCancelConfirmation}
      />

      {/*
        Quality enables TTA, which runs every tile eight times. On a video
        that turns a job measured in minutes into one measured in hours, and
        a progress bar cannot distinguish that from something being broken.
        Confirmed before the run rather than explained afterwards.
      */}
      {/*
        Crashed-run recovery. Escape and the plain button mean "not now" --
        the frames stay on disk for a later launch. Deleting hours of GPU
        work is only reachable by clicking the explicit quiet action, never
        by a stray Enter or Escape.
      */}
      <ConfirmCancelDialog
        isOpen={offeredResume != null}
        title="Finish an interrupted upscale?"
        message={
          offeredResume
            ? `${offeredResume.file_name} was interrupted, but ${offeredResume.frames_done} upscaled frame${offeredResume.frames_done === 1 ? '' : 's'} survived. Resuming keeps them and only upscales what's missing.`
            : ''
        }
        confirmText="Resume upscaling"
        cancelText="Not now"
        secondaryText="Delete partial work"
        confirmIsPositive
        onConfirm={handleResumeOffered}
        onDismiss={dismissOfferedResume}
        onSecondary={handleDiscardOffered}
      />

      <ConfirmCancelDialog
        isOpen={confirmSlowRunOpen}
        title="This will take a long time"
        message="The Quality preset runs every tile 8 times (TTA), which is far slower on video than on a single image — expect hours rather than minutes for a full clip. Switch to Balanced for the same model at normal speed."
        confirmText="Run anyway"
        cancelText="Go back"
        onConfirm={handleConfirmSlowRun}
        onDismiss={dismissSlowRunConfirmation}
      />
    </>
  );
});

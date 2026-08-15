import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DropZone } from '../DropZone';
import { ComparisonSlider } from '../ComparisonSlider';
import { StudioGridOverlay } from './StudioGridOverlay';
import { getMediaSrc } from '../../lib/media';
import {
  useComparisonViewMode,
  useIsProcessing,
  useProgressItem,
  useSelectedItem,
  useUpscaledPath,
  useZoomLevel,
} from '../../store/selectors';
import { studioActions } from '../../store/studioStore';
import { openFiles, openFolder } from '../../store/studioCommands';

interface StudioPreviewSectionProps {
  isDragOver: boolean;
}

const handleOpenFile = () => void openFiles();
const handleOpenFolder = () => void openFolder();

export const StudioPreviewSection = memo(function StudioPreviewSection({
  isDragOver,
}: StudioPreviewSectionProps) {
  const selected = useSelectedItem();
  const progressItem = useProgressItem();
  const upscaledPath = useUpscaledPath();
  const comparisonViewMode = useComparisonViewMode();
  const zoomLevel = useZoomLevel();
  const isProc = useIsProcessing();

  const inputMedia = selected?.filePath;
  const progressVal = progressItem?.progress ?? 0;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--bg-stripe)',
      }}
    >
      <AnimatePresence mode="wait">
        {!inputMedia ? (
          <motion.div
            key="empty-stage"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(105% 75% at 50% 45%, rgba(11,10,9,.55), rgba(11,10,9,.88) 78%)',
              }}
            />
            <DropZone
              isDragOver={isDragOver}
              onAddFiles={handleOpenFile}
              onAddBatch={handleOpenFolder}
              onBrowseClick={handleOpenFile}
            />
          </motion.div>
        ) : (
          <motion.div
            key={inputMedia}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* Premium Canvas Light Bloom Overlay on Media Entry */}
            <motion.div
              initial={{ opacity: 0.4, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 15,
                background:
                  'radial-gradient(circle at 50% 50%, rgba(241,254,200,0.14), transparent 70%)',
              }}
            />

            {upscaledPath ? (
              <ComparisonSlider
                inputPath={inputMedia}
                outputPath={upscaledPath}
                viewMode={comparisonViewMode}
                zoom={zoomLevel}
                onZoomChange={studioActions.setZoomLevel}
              />
            ) : (
              <>
                {selected.isVideo ? (
                  <video
                    src={getMediaSrc(inputMedia)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: isProc ? 'opacity(0.3) blur(2px)' : 'none',
                      transition: 'filter .2s ease',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `url(${getMediaSrc(inputMedia)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      filter: isProc ? 'opacity(0.3) blur(2px)' : 'none',
                      transition: 'filter .2s ease',
                    }}
                  />
                )}

                {isProc && <StudioGridOverlay progressVal={progressVal} />}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

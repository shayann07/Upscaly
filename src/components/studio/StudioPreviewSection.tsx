import { motion, AnimatePresence } from 'framer-motion';
import { DropZone } from '../DropZone';
import { ComparisonSlider } from '../ComparisonSlider';
import { StudioGridOverlay } from './StudioGridOverlay';
import { BatchItem } from '../../lib/types';
import { getMediaSrc } from '../../lib/media';

interface StudioPreviewSectionProps {
  filePath: string | null;
  batchItems: BatchItem[];
  upscaledPath: string | null;
  jobStatus: string;
  comparisonViewMode: 'split' | 'side-by-side';
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  handleOpenFile: () => void;
  handleOpenFolder?: () => void;
  isProc: boolean;
  progressVal: number;
}

export function StudioPreviewSection({
  filePath,
  batchItems,
  upscaledPath,
  jobStatus,
  comparisonViewMode,
  zoomLevel,
  setZoomLevel,
  handleOpenFile,
  handleOpenFolder,
  isProc,
  progressVal,
}: StudioPreviewSectionProps) {
  const inputMedia = filePath || (batchItems.length > 0 ? (batchItems[0].filePath || batchItems[0].path) : undefined);
  const isVideo = inputMedia ? /\.(mp4|mkv|mov|avi|webm)$/i.test(inputMedia) : false;

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
        {!filePath && batchItems.length === 0 ? (
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
              isDragOver={false}
              onAddFiles={handleOpenFile}
              onAddBatch={handleOpenFolder || handleOpenFile}
              onBrowseClick={handleOpenFile}
            />
          </motion.div>
        ) : (
          <motion.div
            key={filePath || 'active-stage'}
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

            {jobStatus === 'completed' && upscaledPath ? (
              <ComparisonSlider
                inputPath={inputMedia}
                outputPath={upscaledPath}
                viewMode={comparisonViewMode}
                zoom={zoomLevel}
                onZoomChange={setZoomLevel}
              />
            ) : (
              <>
                {inputMedia && isVideo ? (
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
                ) : inputMedia ? (
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
                ) : null}

                {isProc && <StudioGridOverlay progressVal={progressVal} />}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

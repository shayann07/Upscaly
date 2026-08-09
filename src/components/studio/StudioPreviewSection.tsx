import { motion, AnimatePresence } from 'framer-motion';
import { DropZone } from '../DropZone';
import { ComparisonSlider } from '../ComparisonSlider';
import { StudioGridOverlay } from './StudioGridOverlay';
import { BatchItem } from '../../lib/types';

interface StudioPreviewSectionProps {
  filePath: string | null;
  batchItems: BatchItem[];
  upscaledPath: string | null;
  comparisonViewMode: 'split' | 'side-by-side';
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  handleOpenFile: () => void;
  isProc: boolean;
  progressVal: number;
}

export function StudioPreviewSection({
  filePath,
  batchItems,
  upscaledPath,
  comparisonViewMode,
  zoomLevel,
  setZoomLevel,
  handleOpenFile,
  isProc,
  progressVal,
}: StudioPreviewSectionProps) {
  const inputMedia = filePath || (batchItems.length > 0 ? batchItems[0].filePath : undefined);

  return (
    <div className="absolute inset-0 bg-[var(--bg-stripe)]">
      <AnimatePresence mode="wait">
        {!filePath && batchItems.length === 0 ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full flex items-center justify-center"
          >
            <DropZone
              isDragOver={false}
              onAddFiles={handleOpenFile}
              onBrowseClick={handleOpenFile}
            />
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full relative overflow-hidden"
          >
            <ComparisonSlider
              inputPath={inputMedia}
              outputPath={upscaledPath || undefined}
              viewMode={comparisonViewMode}
              zoom={zoomLevel}
              onZoomChange={setZoomLevel}
            />

            {isProc && <StudioGridOverlay progressVal={progressVal} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

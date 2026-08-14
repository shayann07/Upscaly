import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { BatchItem } from '../lib/types';
import { playDropSound } from '../lib/sound';
import { getMediaDimensions, getMediaSrc } from '../lib/media';

async function buildBatchItem(path: string, model: string): Promise<BatchItem> {
  const name = path.split(/[\\/]/).pop() || 'media_file';
  const isVid = /\.(mp4|mkv|mov|avi)$/i.test(name);
  const dims = await getMediaDimensions(getMediaSrc(path), isVid);
  return {
    id: Math.random().toString(),
    filePath: path,
    fileName: name,
    w: dims.w,
    h: dims.h,
    fileSize: Math.round((dims.w * dims.h * 3) / 2),
    isVideo: isVid,
    progress: 0,
    status: 'ready',
    model,
  };
}

export interface UseMediaSelectionOptions {
  isMuted: boolean;
  selectedModel: string;
  setBatchItems: Dispatch<SetStateAction<BatchItem[]>>;
  onCategorySelect?: (cat: 'photos' | 'anime' | 'video') => void;
  onNotify?: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
  onResetJob?: () => void;
}

export function useMediaSelection({
  isMuted,
  selectedModel,
  setBatchItems,
  onCategorySelect,
  onNotify,
  onResetJob,
}: UseMediaSelectionOptions) {
  const [filePath, setFilePath] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [currentFileDims, setCurrentFileDims] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [upscaledPath, setUpscaledPath] = useState<string>('');

  const handleClearFile = useCallback(() => {
    setFilePath('');
    setFileName('');
    setIsVideo(false);
    setCurrentFileDims(null);
    setUpscaledPath('');
    setBatchItems([]);
    if (onResetJob) onResetJob();
    if (onNotify) onNotify('info', 'Queue Cleared', 'Ready for next input.');
  }, [onResetJob, onNotify, setBatchItems]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== 'string') return;
      playDropSound(isMuted);
      setUpscaledPath('');
      if (onResetJob) onResetJob();
      setBatchItems((prev) => [
        ...prev,
        {
          id: `folder-${Date.now()}`,
          fileName: selected.split(/[\\/]/).pop() || 'Folder',
          filePath: selected,
          path: selected,
          status: 'queued',
          progress: 0,
        },
      ]);
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  }, [isMuted, onResetJob, setBatchItems]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Media Files',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mkv', 'mov', 'avi'],
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;
      playDropSound(isMuted);
      setUpscaledPath('');
      if (onResetJob) onResetJob();

      const newItems: BatchItem[] = [];
      for (const path of paths) {
        newItems.push(await buildBatchItem(path, selectedModel));
      }

      setBatchItems((prev) => (paths.length === 1 ? newItems : [...prev, ...newItems]));
      setFilePath(newItems[0].filePath || '');
      setFileName(newItems[0].fileName || '');
      setIsVideo(newItems[0].isVideo || false);
      setCurrentFileDims({
        w: newItems[0].w || 1920,
        h: newItems[0].h || 1080,
      });

      if (paths.length === 1) {
        setUpscaledPath('');
        if (onResetJob) onResetJob();
        if (onCategorySelect) {
          onCategorySelect(newItems[0].isVideo ? 'video' : 'photos');
        }
        if (onNotify) {
          onNotify(
            'info',
            'File Loaded',
            `${newItems[0].fileName} (${newItems[0].w}×${newItems[0].h})`
          );
        }
      } else if (onNotify) {
        onNotify('info', 'Batch Loaded', `Added ${paths.length} files to queue.`);
      }
    } catch (err) {
      console.error('Failed to select file:', err);
    }
  }, [isMuted, selectedModel, onCategorySelect, onNotify, onResetJob, setBatchItems]);

  return {
    filePath,
    setFilePath,
    fileName,
    setFileName,
    isVideo,
    setIsVideo,
    currentFileDims,
    setCurrentFileDims,
    upscaledPath,
    setUpscaledPath,
    handleClearFile,
    handleOpenFile,
    handleOpenFolder,
  };
}

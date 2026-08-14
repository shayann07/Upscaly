import { useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mkv', 'mov', 'avi'];

function isSupportedMediaFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return Boolean(ext && SUPPORTED_EXTENSIONS.includes(ext));
}

/**
 * Wires the OS-level file drop (DropZone previously only ever showed
 * "Drop media to upscale" / "Release to queue" with no listener behind
 * either state -- `isDragOver` was hardcoded false and dropping a file did
 * nothing). Mirrors the unlisten-on-unmount pattern used by useJobEvents.
 */
export function useDragDrop(
  onFilesDropped: (paths: string[]) => void,
  onNotify?: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void
) {
  const [isDragOver, setIsDragOver] = useState(false);

  const onFilesDroppedRef = useRef(onFilesDropped);
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onFilesDroppedRef.current = onFilesDropped;
  }, [onFilesDropped]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (isCancelled) return;
        const { payload } = event;

        if (payload.type === 'enter' || payload.type === 'over') {
          setIsDragOver(true);
          return;
        }

        if (payload.type === 'leave') {
          setIsDragOver(false);
          return;
        }

        // payload.type === 'drop'
        setIsDragOver(false);
        const supported = payload.paths.filter(isSupportedMediaFile);
        if (supported.length === 0) {
          onNotifyRef.current?.(
            'warning',
            'Unsupported File',
            'Drop a PNG, JPG, WEBP, MP4, MKV, MOV, or AVI file.'
          );
          return;
        }
        onFilesDroppedRef.current(supported);
      })
      .then((fn) => {
        if (isCancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => {
        console.warn('Failed to attach drag-drop listener:', err);
      });

    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return { isDragOver };
}

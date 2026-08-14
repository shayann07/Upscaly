import { convertFileSrc } from '@tauri-apps/api/core';

export function getMediaSrc(path: string | undefined | null): string {
  if (!path) return '';

  if (
    path.startsWith('blob:') ||
    path.startsWith('data:') ||
    path.startsWith('http://') ||
    path.startsWith('https://')
  ) {
    return path;
  }

  try {
    return convertFileSrc(path);
  } catch (err) {
    console.warn('convertFileSrc fallback to path:', err);
    return path;
  }
}

const DEFAULT_DIMS = { w: 1920, h: 1080 };
const DIMENSION_PROBE_TIMEOUT_MS = 8000;

export function getMediaDimensions(src: string, isVid: boolean): Promise<{ w: number; h: number }> {
  const probe = new Promise<{ w: number; h: number }>((resolve) => {
    if (isVid) {
      const vid = document.createElement('video');
      vid.src = src;
      vid.onloadedmetadata = () => {
        resolve({ w: vid.videoWidth || DEFAULT_DIMS.w, h: vid.videoHeight || DEFAULT_DIMS.h });
      };
      vid.onerror = () => resolve(DEFAULT_DIMS);
    } else {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        resolve({ w: img.width || DEFAULT_DIMS.w, h: img.height || DEFAULT_DIMS.h });
      };
      img.onerror = () => resolve(DEFAULT_DIMS);
    }
  });

  // A metadata stall (an exotic codec the webview half-accepts, a file on
  // a slow/unmounted network path) neither resolves nor errors, so this
  // promise would otherwise hang forever. Since callers await one file at
  // a time in a batch, that stalled the entire remaining selection with
  // no error surfaced. Fall back to default dimensions instead of
  // blocking indefinitely.
  const timeout = new Promise<{ w: number; h: number }>((resolve) => {
    setTimeout(() => resolve(DEFAULT_DIMS), DIMENSION_PROBE_TIMEOUT_MS);
  });

  return Promise.race([probe, timeout]);
}

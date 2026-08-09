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

export function getMediaDimensions(src: string, isVid: boolean): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (isVid) {
      const vid = document.createElement('video');
      vid.src = src;
      vid.onloadedmetadata = () => {
        resolve({ w: vid.videoWidth || 1920, h: vid.videoHeight || 1080 });
      };
      vid.onerror = () => resolve({ w: 1920, h: 1080 });
    } else {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        resolve({ w: img.width || 1920, h: img.height || 1080 });
      };
      img.onerror = () => resolve({ w: 1920, h: 1080 });
    }
  });
}

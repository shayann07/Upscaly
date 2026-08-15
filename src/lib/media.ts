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

const DIMENSION_PROBE_TIMEOUT_MS = 8000;

export type MediaDimensions = { w: number; h: number };

/**
 * Probes a file's source dimensions, or resolves `null` if it cannot.
 *
 * Failure used to resolve a hardcoded 1920x1080, which the UI then rendered
 * as the file's real size and multiplied by the scale factor to quote an
 * output resolution and file size -- figures indistinguishable from measured
 * ones and wrong for every file that wasn't 1080p. Unknown is reported as
 * unknown, and callers render nothing rather than a number they made up.
 */
export function getMediaDimensions(src: string, isVid: boolean): Promise<MediaDimensions | null> {
  const probe = new Promise<MediaDimensions | null>((resolve) => {
    if (isVid) {
      const vid = document.createElement('video');
      vid.src = src;
      vid.onloadedmetadata = () => {
        resolve(
          vid.videoWidth && vid.videoHeight ? { w: vid.videoWidth, h: vid.videoHeight } : null
        );
      };
      vid.onerror = () => resolve(null);
    } else {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        resolve(img.width && img.height ? { w: img.width, h: img.height } : null);
      };
      img.onerror = () => resolve(null);
    }
  });

  // A metadata stall (an exotic codec the webview half-accepts, a file on a
  // slow or unmounted network path) neither resolves nor errors, so this
  // promise would otherwise hang forever -- and with it, anything awaiting
  // the probe. Give up after a bound and report the result as unknown.
  const timeout = new Promise<MediaDimensions | null>((resolve) => {
    setTimeout(() => resolve(null), DIMENSION_PROBE_TIMEOUT_MS);
  });

  return Promise.race([probe, timeout]);
}

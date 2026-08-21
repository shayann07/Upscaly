import { getMediaSrc } from './media';
import { allowMediaPath } from './assetScope';

const MAX_CACHE_SIZE = 300;

// In-memory cache of allowed media URLs / generated thumbnail data URLs
const memoryCache = new Map<string, string>();
const pendingPromises = new Map<string, Promise<string | null>>();

function evictOldestIfFull() {
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }
}

function generateVideoThumbnail(videoSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(videoSrc);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let resolved = false;
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(videoSrc);
      }
    }, 1500);

    const capture = () => {
      if (resolved) return;
      try {
        const w = video.videoWidth || 80;
        const h = video.videoHeight || 80;
        const canvas = document.createElement('canvas');
        const aspect = w / Math.max(1, h);
        canvas.width = 80;
        canvas.height = Math.round(80 / aspect);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(dataUrl);
          return;
        }
      } catch {
        // Fallback to direct media source
      }
      resolved = true;
      clearTimeout(timer);
      cleanup();
      resolve(videoSrc);
    };

    video.onseeked = capture;
    video.onloadeddata = () => {
      if (video.currentTime > 0) {
        capture();
      } else {
        video.currentTime = 0.05;
      }
    };
    video.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        cleanup();
        resolve(videoSrc);
      }
    };

    video.src = videoSrc;
  });
}

/**
 * Returns a media source URL or fast thumbnail data URL for an image or video path,
 * ensuring asset protocol permission is granted and cached.
 */
export function getThumbnail(
  filePath: string | undefined | null,
  isVideo = false
): Promise<string | null> {
  if (!filePath) return Promise.resolve(null);

  // Check cache
  const cached = memoryCache.get(filePath);
  if (cached) return Promise.resolve(cached);

  // Deduplicate concurrent requests for the same path
  const pending = pendingPromises.get(filePath);
  if (pending) return pending;

  const promise = (async () => {
    try {
      await allowMediaPath(filePath);
      const mediaSrc = getMediaSrc(filePath);
      if (!mediaSrc) return null;

      let finalUrl = mediaSrc;
      if (isVideo) {
        finalUrl = (await generateVideoThumbnail(mediaSrc)) || mediaSrc;
      }

      evictOldestIfFull();
      memoryCache.set(filePath, finalUrl);
      return finalUrl;
    } catch (err) {
      console.warn('Thumbnail resolution failed for:', filePath, err);
      return null;
    } finally {
      pendingPromises.delete(filePath);
    }
  })();

  pendingPromises.set(filePath, promise);
  return promise;
}

export function clearThumbnailCache(): void {
  memoryCache.clear();
  pendingPromises.clear();
}

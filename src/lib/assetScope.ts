import { invoke } from '@tauri-apps/api/core';

const allowedDirs = new Set<string>();

/**
 * The asset protocol's static scope is intentionally empty (see
 * tauri.conf.json) since the app lets users pick media from anywhere on
 * disk. Call this -- and await it -- with any path that is about to be
 * previewed via getMediaSrc/convertFileSrc (input files, output files,
 * history entries, a newly chosen output directory) so the backend can
 * grant the webview read access to just that one directory before the
 * preview actually loads.
 */
export async function allowMediaPath(path: string | undefined | null): Promise<void> {
  if (!path) return;
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = lastSlash !== -1 ? normalized.substring(0, lastSlash) : normalized;

  if (allowedDirs.has(dir.toLowerCase())) {
    return;
  }

  try {
    await invoke('allow_media_path', { path });
    allowedDirs.add(dir.toLowerCase());
  } catch (err) {
    console.warn('Failed to extend asset scope for path:', path, err);
  }
}

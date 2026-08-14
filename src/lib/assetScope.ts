import { invoke } from '@tauri-apps/api/core';

/**
 * The asset protocol's static scope is intentionally empty (see
 * tauri.conf.json) since the app lets users pick media from anywhere on
 * disk. Call this -- and await it -- with any path that is about to be
 * previewed via getMediaSrc/convertFileSrc (input files, output files,
 * history entries, a newly chosen output directory) so the backend can
 * grant the webview read access to just that one directory before the
 * preview actually loads.
 *
 * Best-effort: failures are swallowed (never throws) so a scope hiccup
 * never blocks the actual user action -- worst case the preview falls
 * back to its default dimensions the same way a load error already does.
 */
export async function allowMediaPath(path: string | undefined | null): Promise<void> {
  if (!path) return;
  try {
    await invoke('allow_media_path', { path });
  } catch (err) {
    console.warn('Failed to extend asset scope for path:', path, err);
  }
}

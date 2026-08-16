import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { studioActions, studioStore } from '../store/studioStore';

/**
 * Whether the updater can run at all in this build.
 *
 * A dev build has no signed installer behind it and its version comes from
 * whatever is in tauri.conf.json at the time, so a check would either find
 * "an update" for a version you are actively editing or fail against an
 * endpoint listing artifacts this binary was never built from. Neither is
 * useful, and installing over a dev build would replace it with the
 * released one mid-session.
 *
 * Read per call rather than captured once at module load, so it reflects
 * the environment at the moment it matters -- and so tests can exercise
 * both sides of it, which a module-level const would freeze shut.
 */
function updatesSupported(): boolean {
  return !import.meta.env.DEV;
}

/**
 * Reads this build's version from Tauri's own metadata, which comes from
 * tauri.conf.json at compile time. The titlebar previously rendered a
 * hardcoded string, which would silently disagree with the real binary as
 * soon as a release bumped the version.
 */
export async function loadAppVersion(): Promise<void> {
  try {
    studioActions.setAppVersion(await getVersion());
  } catch {
    // Non-Tauri context (vitest/jsdom, browser preview). The titlebar
    // simply renders no version rather than a wrong one.
  }
}

/**
 * Looks for a newer release. Silent by design: this runs unprompted at
 * launch, and a machine that is offline or behind a proxy should get a
 * badge that never appears, not an error toast on every start.
 *
 * `manual` flips that -- when the user explicitly asks, silence would read
 * as a broken button, so both "you're up to date" and the failure reason
 * are surfaced.
 */
export async function checkForUpdates(manual = false): Promise<void> {
  if (!updatesSupported()) {
    if (manual) {
      studioActions.notify('info', 'Updates disabled in development', 'This is a dev build.');
    }
    return;
  }
  if (studioStore.getState().updatePhase !== 'idle') return;

  studioActions.setUpdatePhase('checking');
  try {
    const update = await check();
    if (update) {
      studioActions.setAvailableUpdate({ version: update.version, notes: update.body ?? '' });
    } else {
      studioActions.setAvailableUpdate(null);
      if (manual) {
        studioActions.notify(
          'success',
          'Up to date',
          `Upscaly ${studioStore.getState().appVersion} is the latest version.`
        );
      }
    }
  } catch (err) {
    if (manual) {
      studioActions.notify('error', 'Could not check for updates', String(err));
    }
  } finally {
    studioActions.setUpdatePhase('idle');
  }
}

/**
 * Downloads and installs the pending update, then relaunches.
 *
 * `check()` is called a second time rather than holding the earlier
 * `Update` object in the store: it owns a Rust-side resource handle, and
 * parking that in React state across an arbitrary gap (the badge can sit
 * unclicked for hours) risks operating on a handle whose backing resource
 * is gone. Re-checking costs one request and always yields a live handle.
 */
export async function downloadAndInstallUpdate(): Promise<void> {
  if (!updatesSupported()) return;
  if (studioStore.getState().updatePhase !== 'idle') return;

  studioActions.setUpdatePhase('downloading');
  studioActions.setUpdateProgress(0);
  try {
    const update = await check();
    if (!update) {
      studioActions.setAvailableUpdate(null);
      studioActions.setUpdatePhase('idle');
      return;
    }

    let contentLength = 0;
    let received = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength ?? 0;
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength;
        // A server that omits Content-Length leaves nothing to compute a
        // percentage from. Report no progress rather than inventing one.
        if (contentLength > 0) {
          studioActions.setUpdateProgress(Math.min(100, (received / contentLength) * 100));
        }
      } else if (event.event === 'Finished') {
        studioActions.setUpdatePhase('installing');
      }
    });

    await relaunch();
  } catch (err) {
    studioActions.setUpdatePhase('idle');
    studioActions.notify('error', 'Update failed', String(err));
  }
}

import { check } from '@tauri-apps/plugin-updater';
import { exit } from '@tauri-apps/plugin-process';
import { getName, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { bootName } from './boot';
import { studioActions, studioStore } from '../store/studioStore';

let debugBuild: boolean | null = null;

/**
 * Resets the cached debugBuild flag. Used in unit tests.
 */
export function _resetDebugBuildForTesting(): void {
  debugBuild = null;
}

/**
 * Whether the updater can run at all in this build.
 *
 * A dev or debug build has no signed installer behind it and its version
 * comes from whatever is in tauri.conf.json at the time, so a check would
 * either find "an update" for a version you are actively editing or fail
 * against an endpoint listing artifacts this binary was never built from.
 * Neither is useful, and installing over a dev build would replace it with the
 * released one mid-session.
 *
 * Consults both `import.meta.env.DEV` (Vite dev server) and `is_debug_build`
 * (Rust debug assertions) because `tauri build --debug` runs a production Vite
 * build where `import.meta.env.DEV` is false.
 */
async function updatesSupported(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  if (debugBuild === null) {
    const res = await Promise.resolve(invoke<boolean>('is_debug_build')).catch(() => false);
    debugBuild = typeof res === 'boolean' ? res : false;
  }
  return !debugBuild;
}

/**
 * Reads this build's name and version from Tauri's own metadata, which
 * comes from tauri.conf.json at compile time.
 */
export async function loadAppIdentity(): Promise<void> {
  try {
    const [name, version] = await Promise.all([getName(), getVersion()]);
    if (typeof name === 'string' && name.length > 0) {
      studioActions.setAppName(name);
      bootName(name);
    } else {
      console.warn('[updater] getName() returned non-string or empty name:', name);
    }
    if (typeof version === 'string' && version.length > 0) {
      studioActions.setAppVersion(version);
    }
  } catch {
    // Non-Tauri context (vitest/jsdom, browser preview). The titlebar
    // simply renders default name and no version rather than a wrong one.
  }
}

export const loadAppVersion = loadAppIdentity;

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
  if (!(await updatesSupported())) {
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
          `Upscaly Studio ${studioStore.getState().appVersion} is the latest version.`
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
 * Downloads and installs the pending update, then exits.
 *
 * `check()` is called a second time rather than holding the earlier
 * `Update` object in the store: it owns a Rust-side resource handle, and
 * parking that in React state across an arbitrary gap (the badge can sit
 * unclicked for hours) risks operating on a handle whose backing resource
 * is gone. Re-checking costs one request and always yields a live handle.
 */
export async function downloadAndInstallUpdate(): Promise<void> {
  if (!(await updatesSupported())) return;
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

    // Exit -- never relaunch. `relaunch()` starts a *new* upscaly.exe and
    // then quits this one, so the fresh process holds the very binary the
    // NSIS installer is trying to overwrite. Not theoretical: on 2026-08-27
    // the 1.0.4 -> 1.0.5 update died on "Error opening file for writing:
    // ...\upscaly.exe", and the log shows the app still writing entries
    // three minutes after the installer launched -- the relaunched instance,
    // holding the lock.
    //
    // Tauri's guidance is that no relaunch call belongs here at all: "On
    // Windows the application is automatically exited when the install step
    // is executed due to a limitation of Windows installers." The NSIS
    // installer restarts the app itself once finished. Exiting explicitly
    // rather than trusting that keeps the binary unlocked even when the
    // automatic exit is late -- which is the window this bug fell through.
    await exit(0);
  } catch (err) {
    studioActions.setUpdatePhase('idle');
    studioActions.notify('error', 'Update failed', String(err));
  }
}

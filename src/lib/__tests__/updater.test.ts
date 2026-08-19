import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  checkForUpdates,
  downloadAndInstallUpdate,
  loadAppIdentity,
  _resetDebugBuildForTesting,
} from '../updater';
import { resetStudioStore, studioActions, studioStore } from '../../store/studioStore';
import { invoke } from '@tauri-apps/api/core';
import { getName, getVersion } from '@tauri-apps/api/app';

vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@tauri-apps/api/app', () => ({ getName: vi.fn(), getVersion: vi.fn() }));

const mockGetName = vi.mocked(getName);
const mockGetVersion = vi.mocked(getVersion);
const mockCheck = vi.mocked(check);
const mockRelaunch = vi.mocked(relaunch);
const mockInvoke = vi.mocked(invoke);
const state = () => studioStore.getState();

/**
 * Vitest runs with `import.meta.env.DEV` true, which is exactly the
 * condition the updater refuses to run under. Every test that exercises a
 * real update path has to present itself as a production build first.
 */
function asProductionBuild() {
  vi.stubEnv('DEV', false);
}

function fakeUpdate(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.2.0',
    body: 'Fixed a thing.',
    downloadAndInstall: vi.fn(),
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof check>>;
}

beforeEach(() => {
  resetStudioStore();
  _resetDebugBuildForTesting();
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('checkForUpdates', () => {
  it('never contacts the update endpoint from a debug bundle', async () => {
    asProductionBuild();
    mockInvoke.mockResolvedValueOnce(true);

    await checkForUpdates(true);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(state().availableUpdate).toBeNull();
    expect(state().toasts[0].message).toContain('Updates disabled in development');
  });

  it('never contacts the update endpoint from a dev build', async () => {
    // Installing a release over a running dev build would replace the
    // binary being worked on, and the version it would compare against is
    // whatever tauri.conf.json happens to say mid-edit.
    await checkForUpdates();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(state().availableUpdate).toBeNull();
  });

  it('tells the user why the button did nothing when they asked explicitly', async () => {
    await checkForUpdates(true);
    expect(state().toasts).toHaveLength(1);
    expect(state().toasts[0].message).toContain('Updates disabled in development');
  });

  it('records an available update for the badge to render', async () => {
    asProductionBuild();
    mockCheck.mockResolvedValue(fakeUpdate());

    await checkForUpdates();

    expect(state().availableUpdate).toEqual({ version: '1.2.0', notes: 'Fixed a thing.' });
    expect(state().updatePhase).toBe('idle');
  });

  it('stays silent on an automatic check that finds nothing', async () => {
    // This one runs unprompted at every launch. An "up to date" toast here
    // would fire on every single start of the app.
    asProductionBuild();
    mockCheck.mockResolvedValue(null);

    await checkForUpdates();

    expect(state().availableUpdate).toBeNull();
    expect(state().toasts).toHaveLength(0);
  });

  it('confirms up-to-date when the user asked, so the button is not a no-op', async () => {
    asProductionBuild();
    studioActions.setAppVersion('1.1.0');
    mockCheck.mockResolvedValue(null);

    await checkForUpdates(true);

    expect(state().toasts[0].message).toContain('Up to date');
    expect(state().toasts[0].message).toContain('1.1.0');
  });

  it('swallows a failed automatic check but reports a failed manual one', async () => {
    // Offline, captive portal or a proxy blocking GitHub must not produce
    // an error toast on every launch -- but must explain itself when the
    // user pressed the button.
    asProductionBuild();
    mockCheck.mockRejectedValue(new Error('network unreachable'));

    await checkForUpdates();
    expect(state().toasts).toHaveLength(0);

    await checkForUpdates(true);
    expect(state().toasts[0].message).toContain('Could not check for updates');
  });

  it('releases the phase after a failure so a later check can still run', async () => {
    asProductionBuild();
    mockCheck.mockRejectedValue(new Error('boom'));

    await checkForUpdates();

    expect(state().updatePhase).toBe('idle');
  });
});

describe('downloadAndInstallUpdate', () => {
  it('reports real download progress and relaunches when finished', async () => {
    asProductionBuild();
    // Sampled mid-flight, not after the run: reaching `installing` zeroes
    // the bar on purpose, so that a later download cannot briefly paint a
    // stale percentage before its first chunk lands.
    const observed: number[] = [];
    const downloadAndInstall = vi.fn(async (onEvent: (e: Record<string, unknown>) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 200 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      observed.push(state().updateProgress);
      onEvent({ event: 'Progress', data: { chunkLength: 150 } });
      observed.push(state().updateProgress);
      onEvent({ event: 'Finished' });
    });
    mockCheck.mockResolvedValue(fakeUpdate({ downloadAndInstall }));

    await downloadAndInstallUpdate();

    expect(observed).toEqual([25, 100]);
    expect(state().updatePhase).toBe('installing');
    expect(mockRelaunch).toHaveBeenCalledOnce();
  });

  it('leaves progress at zero when the server sends no content length', async () => {
    // Never invent a percentage: a fabricated bar that jumps to 100% and
    // sits there is worse than no bar.
    asProductionBuild();
    const downloadAndInstall = vi.fn(async (onEvent: (e: Record<string, unknown>) => void) => {
      onEvent({ event: 'Started', data: {} });
      onEvent({ event: 'Progress', data: { chunkLength: 4096 } });
    });
    mockCheck.mockResolvedValue(fakeUpdate({ downloadAndInstall }));

    await downloadAndInstallUpdate();

    expect(state().updateProgress).toBe(0);
  });

  it('surfaces a failed install and returns to idle rather than wedging', async () => {
    asProductionBuild();
    mockCheck.mockResolvedValue(
      fakeUpdate({
        downloadAndInstall: vi.fn().mockRejectedValue(new Error('signature mismatch')),
      })
    );

    await downloadAndInstallUpdate();

    expect(state().updatePhase).toBe('idle');
    expect(state().toasts[0].message).toContain('Update failed');
    expect(mockRelaunch).not.toHaveBeenCalled();
  });

  it('does not start a second download while one is already running', async () => {
    asProductionBuild();
    studioActions.setUpdatePhase('downloading');

    await downloadAndInstallUpdate();

    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe('loadAppIdentity', () => {
  it('updates store appName and appVersion when valid metadata is returned', async () => {
    mockGetName.mockResolvedValue('Upscaly Studio');
    mockGetVersion.mockResolvedValue('1.0.1');

    await loadAppIdentity();

    expect(state().appName).toBe('Upscaly Studio');
    expect(state().appVersion).toBe('1.0.1');
  });

  it('keeps default appName when getName() returns empty string or non-string', async () => {
    mockGetName.mockResolvedValue('');
    mockGetVersion.mockResolvedValue('1.0.1');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loadAppIdentity();

    expect(state().appName).toBe('Upscaly Studio');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[updater] getName() returned non-string or empty name:'),
      ''
    );
    warnSpy.mockRestore();
  });

  it('ignores errors in non-Tauri environments gracefully', async () => {
    mockGetName.mockRejectedValue(new Error('Tauri not running'));
    mockGetVersion.mockRejectedValue(new Error('Tauri not running'));

    await loadAppIdentity();

    expect(state().appName).toBe('Upscaly Studio');
    expect(state().appVersion).toBe('');
  });
});

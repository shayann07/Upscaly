import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings, GpuInfo } from '../lib/types';
import { allowMediaPath } from '../lib/assetScope';
import { CPU_DEVICE_ID, resolveGpu } from '../lib/gpuSelection';
import { refreshCatalog } from '../store/studioCommands';
import { checkForUpdates, loadAppIdentity } from '../lib/updater';
import { bootArm, bootComplete, bootStatus } from '../lib/boot';
import { studioActions, studioStore } from '../store/studioStore';

import { useStoreValue } from '../store/createStore';
import { StudioState } from '../store/studioStore';

/**
 * Hard ceiling on how long the splash may stay up. Generous relative to a
 * healthy start (well under a second once the engine has been probed once)
 * but short enough that a stuck step is a brief delay rather than a
 * permanently frozen-looking app.
 *
 * MUST stay below the Rust backend failsafe (5 s) in src-tauri/src/lib.rs,
 * so the frontend always has the opportunity to reveal #root before the
 * backend forces the window visible.
 */
const BOOT_FAILSAFE_MS = 4000;

/** Every field the save effect below persists, as one comparable tuple. */
const selectPersisted = (s: StudioState) =>
  [
    s.settingsLoaded,
    s.selectedGpu,
    s.scale,
    s.tileSize,
    s.preset,
    s.outputFormat,
    s.customModelsDir,
    s.gentleMode,
    s.customOutputPath,
    s.isMuted,
    s.autoCheckUpdates,
  ].join(' ');

/** Applies everything in the saved settings except the GPU choice. */
async function restoreNonGpuSettings(saved: AppSettings): Promise<void> {
  if (saved.default_scale != null) studioActions.setScale(saved.default_scale);
  if (saved.default_tile_size != null) studioActions.setTileSize(saved.default_tile_size);
  if (saved.default_preset != null) studioActions.setPreset(saved.default_preset);
  if (saved.default_output_format != null) {
    studioActions.setOutputFormat(saved.default_output_format);
  }
  if (saved.custom_models_dir) studioActions.setCustomModelsDir(saved.custom_models_dir);
  if (saved.gentle_mode != null) studioActions.setGentleMode(saved.gentle_mode);
  if (saved.auto_check_updates != null) {
    studioActions.setAutoCheckUpdates(saved.auto_check_updates);
  }
  if (saved.sound_muted != null) {
    // The backend is the durable source of truth; localStorage exists only
    // so mute state can be read synchronously at launch, before this
    // resolves, to avoid an audio flash.
    studioActions.setMuted(saved.sound_muted);
  }
  if (saved.output_directory) {
    await allowMediaPath(saved.output_directory);
    studioActions.setCustomOutputPath(saved.output_directory);
    return;
  }
  try {
    const defaultDir = await invoke<string>('get_default_output_dir');
    await allowMediaPath(defaultDir);
    studioActions.setCustomOutputPath(defaultDir);
  } catch {
    // No default directory available -- leave it empty.
  }
}

function applyGpuChoice(gpus: GpuInfo[], savedName: string | null | undefined): void {
  const { gpu, reason } = resolveGpu(gpus, savedName);

  // No Vulkan device at all: a machine with no discrete card and an iGPU
  // too old for Vulkan, a VM without GPU passthrough, or a broken/missing
  // driver. This used to return silently, leaving the selection at GPU 0 --
  // so the app looked fine until Upscale was pressed and the engine died
  // against a device that does not exist. The engine's own CPU path is
  // selected with `-g -1`; it works, but it is slow enough that saying so
  // is not optional.
  if (!gpu) {
    studioActions.setCpuOnly(true);
    studioActions.setSelectedGpu(CPU_DEVICE_ID);
    studioActions.notify(
      'warning',
      'No compatible GPU found',
      'Upscaly will run on the CPU, which is far slower. Video upscaling is unavailable. Installing or updating a Vulkan-capable graphics driver usually fixes this.'
    );
    return;
  }

  studioActions.setCpuOnly(false);

  studioActions.setSelectedGpu(gpu.id);
  if (reason === 'saved-name-missing') {
    // Never swap the device silently. The previous card being absent
    // changes both speed and output, and the user is the only one who can
    // say whether that substitution is acceptable.
    studioActions.notify(
      'info',
      'Saved GPU not found',
      `"${savedName}" is not available on this system, so ${gpu.name} was selected.`
    );
  } else {
    studioActions.notify('info', 'GPU Acceleration Ready', gpu.name);
  }
}

/**
 * Loads the GPU list, saved preferences and model catalog into the store,
 * and persists preference changes back.
 *
 * The GPU list and the saved settings used to be fetched concurrently, each
 * setting `selectedGpu` from its own effect -- so which device the app ran
 * on depended on which invoke resolved first. They are now sequenced: the
 * enumeration arrives, and only then is the saved choice resolved against
 * it by name. See `resolveGpu` for why the saved *index* cannot be trusted.
 */
export function useSettingsSync() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const bootstrap = async () => {
      // The GPU probe is the slowest step by a wide margin on a first run
      // -- it spawns the engine and waits for it -- and it is what used to
      // leave the titlebar reading "GPU Acceleration" until it resolved.
      // Naming it on the splash means the wait is explained rather than
      // just endured.
      bootStatus('DETECTING GPUS');
      let gpus: GpuInfo[] = [];
      try {
        gpus = await invoke<GpuInfo[]>('list_gpus');
        studioActions.setGpus(gpus);
      } catch {
        // No enumeration: applyGpuChoice below leaves the selection alone.
      }

      bootStatus('LOADING SETTINGS');
      let saved: AppSettings | null = null;
      try {
        saved = await invoke<AppSettings>('get_app_settings');
      } catch {
        // No saved settings; the defaults below still apply.
      }

      applyGpuChoice(gpus, saved?.default_gpu_name);
      if (saved) await restoreNonGpuSettings(saved);

      // After the settings are in, so the user's auto-check preference is
      // the restored one rather than the default. Deliberately not awaited
      // as part of the gate below -- a slow or unreachable update endpoint
      // must not hold `settingsLoaded`, and therefore the whole UI, behind
      // a network round trip.
      if (studioStore.getState().autoCheckUpdates) void checkForUpdates();
    };

    // Armed before anything is awaited, so the splash decision is made as
    // early as this bundle can manage. Not awaited: arming fetches the
    // real launch time over IPC, and the bootstrap must not queue behind
    // that round trip.
    void bootArm();

    void loadAppIdentity();

    // Never let a hung startup strand the user on the splash. Any of these
    // steps can block on something outside our control -- a wedged engine
    // probe, an unreachable catalog -- and an app that is merely missing
    // its GPU list is far better than one that never appears.
    const failsafe = window.setTimeout(bootComplete, BOOT_FAILSAFE_MS);

    // The save effect stays gated until the whole bootstrap settles.
    // Ungating earlier meant a save could fire pairing the resolved GPU
    // with still-default scale, tile size and output directory, silently
    // clobbering saved preferences.
    void bootstrap().finally(() => {
      studioActions.setSettingsLoaded(true);
      window.clearTimeout(failsafe);
      bootComplete();
    });

    void refreshCatalog();
  }, []);

  const persisted = useStoreValue(studioStore, selectPersisted);

  useEffect(() => {
    const s = studioStore.getState();
    if (!s.settingsLoaded) return;
    invoke('update_app_settings', {
      settings: {
        default_gpu_id: s.selectedGpu,
        // The field that actually decides the device next launch. The id
        // above is a hint; Vulkan may hand out a different one tomorrow.
        default_gpu_name: s.gpus.find((g) => g.id === s.selectedGpu)?.name ?? null,
        default_scale: s.scale,
        default_tile_size: s.tileSize,
        default_preset: s.preset,
        default_output_format: s.outputFormat,
        custom_models_dir: s.customModelsDir || null,
        gentle_mode: s.gentleMode,
        output_directory: s.customOutputPath || null,
        sound_muted: s.isMuted,
        auto_check_updates: s.autoCheckUpdates,
      },
    }).catch(() => {});
  }, [persisted]);
}

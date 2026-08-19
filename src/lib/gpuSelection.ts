import { GpuInfo } from './types';

const DISCRETE_GPU_HINTS = ['nvidia', 'geforce', 'rtx', 'gtx', 'radeon'];

/**
 * The engine's own "run on the CPU" device id. `realesrgan-ncnn-vulkan`
 * treats `-g -1` as "no Vulkan device", falling back to ncnn's CPU
 * inference path. It is the only way the app works at all on a machine
 * with no usable GPU, and it is drastically slower -- minutes for a single
 * image where a discrete card takes seconds.
 */
export const CPU_DEVICE_ID = -1;

/** The best default when there is nothing saved: prefer a discrete card. */
export function preferredGpu(gpus: GpuInfo[]): GpuInfo | undefined {
  return (
    gpus.find((g) => DISCRETE_GPU_HINTS.some((hint) => g.name.toLowerCase().includes(hint))) ??
    gpus[0]
  );
}

export type GpuResolution = {
  gpu: GpuInfo | undefined;
  /** How the choice was reached, so the caller can tell the user when it changed. */
  reason: 'saved-name' | 'saved-name-missing' | 'no-saved-name' | 'none-available';
};

/**
 * Picks which GPU to run on, from a *fresh* enumeration.
 *
 * # Why this cannot use the saved index
 *
 * Vulkan's device order is not stable across launches on hybrid laptops. On
 * the development machine the same two devices enumerated as
 * `[0 NVIDIA RTX 3050][1 Intel UHD]` and, minutes later, as
 * `[0 Intel UHD][1 NVIDIA RTX 3050]`. Settings persisted the index, so a
 * saved "0" that meant the discrete card came to mean the iGPU -- the app
 * would quietly run the whole job on integrated graphics: far slower, and
 * different output pixels, with the UI still showing the card the user
 * picked. Nothing about that is visible without watching utilization.
 *
 * So the name is the identity and the index is re-derived every launch.
 *
 * When there is no saved name -- a settings file written before that field
 * existed -- the saved index is deliberately *ignored* rather than trusted,
 * and the discrete-preferring default applies. That resets the choice once
 * for anyone who had deliberately selected an iGPU, which is visible and
 * self-correcting the moment they pick again. Honouring the stale index
 * instead would reinstate exactly the silent-wrong-device bug this exists
 * to remove.
 */
export function resolveGpu(gpus: GpuInfo[], savedName: string | null | undefined): GpuResolution {
  if (gpus.length === 0) return { gpu: undefined, reason: 'none-available' };

  if (savedName) {
    const match = gpus.find((g) => g.name === savedName);
    if (match) return { gpu: match, reason: 'saved-name' };
    // The saved card is not in this enumeration -- an eGPU unplugged, a
    // driver change, a different machine sharing a settings file.
    return { gpu: preferredGpu(gpus), reason: 'saved-name-missing' };
  }

  return { gpu: preferredGpu(gpus), reason: 'no-saved-name' };
}

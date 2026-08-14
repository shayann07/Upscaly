import { GpuInfo } from '../lib/types';
import { useVramProfile } from './useVramProfile';

interface TelemetryOptions {
  gpus: GpuInfo[];
  selectedGpu: number;
  jobStatus: string;
  tileSize: number;
}

// selectedGpu === -1 is the "system RAM" pseudo-GPU choice (CPU fallback),
// which has no VRAM profile to query.
const SYSTEM_RAM_GPU_ID = -1;

/**
 * Was previously fabricated: it parsed a GB figure out of the GPU *name*
 * string via regex, then multiplied by a hardcoded tile-size guess
 * (0.25/0.45/0.75) to invent a "used VRAM" number -- capped at the total,
 * which made isVramOverflowing mathematically unable to ever be true. The
 * real number (get_vram_profile) was already one invoke away and used
 * elsewhere (AdvancedSettings), just never fed into the titlebar/progress
 * overlay that actually displayed a VRAM figure to the user.
 */
export function useTelemetry({ selectedGpu, tileSize }: TelemetryOptions) {
  const { usedVramGb, isOverflowing } = useVramProfile(selectedGpu, tileSize);

  const isSystemRam = selectedGpu === SYSTEM_RAM_GPU_ID;
  const activeVramGb = isSystemRam ? 'SYSTEM RAM' : `${usedVramGb.toFixed(1)} GB`;
  const isVramOverflowing = !isSystemRam && isOverflowing;

  return { activeVramGb, isVramOverflowing };
}

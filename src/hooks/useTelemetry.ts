import { useEffect } from 'react';
import { useVramProfile } from './useVramProfile';
import { studioActions } from '../store/studioStore';
import { useScale, useSelectedGpu, useTileSize } from '../store/selectors';

// selectedGpu === -1 is the "system RAM" pseudo-GPU choice (CPU fallback),
// which has no VRAM profile to query.
const SYSTEM_RAM_GPU_ID = -1;

/**
 * Mirrors the backend's VRAM profile into the store.
 *
 * Mounted once, so the profile is queried once per GPU/tile change no
 * matter how many components display it -- the figures were previously
 * recomputed by every consumer that wanted them.
 *
 * The number itself was fabricated before this existed: a GB figure parsed
 * out of the GPU *name* string, multiplied by a hardcoded tile-size guess,
 * and capped at the total -- which made "overflowing" mathematically
 * impossible. `get_vram_profile` was already one invoke away and used in
 * the settings panel; it just never reached the readouts the user saw.
 */
export function useTelemetrySync() {
  const selectedGpu = useSelectedGpu();
  const tileSize = useTileSize();
  const scale = useScale();
  const { usedVramGb, isOverflowing } = useVramProfile(selectedGpu, tileSize, scale);

  const isSystemRam = selectedGpu === SYSTEM_RAM_GPU_ID;
  // A placeholder while the profile is in flight, rather than a
  // confident-looking number the backend has not actually reported.
  const activeVramGb = isSystemRam
    ? 'SYSTEM RAM'
    : usedVramGb === null
      ? '—'
      : `${usedVramGb.toFixed(1)} GB`;
  const isVramOverflowing = !isSystemRam && isOverflowing;

  useEffect(() => {
    studioActions.setTelemetry(activeVramGb, isVramOverflowing);
  }, [activeVramGb, isVramOverflowing]);
}

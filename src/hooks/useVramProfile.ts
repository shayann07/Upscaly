import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface VramProfile {
  total_vram_mb: number;
  used_vram_mb: number;
  safe_tile_size: number;
  auto_tile_size: number;
  proc_threads: number;
  thread_arg: string;
  is_overflowing: boolean;
  status_message: string;
}

/**
 * `scale` is not optional in spirit: the backend's projection is dominated by
 * the upsampling tail, which runs at `tile * scale`. Asking for a profile
 * without it would report the 2x cost for a 4x run -- a comfortable-looking
 * number for a configuration that exhausts the card.
 */
export function useVramProfile(gpuId: number = 0, tileSize: number = 0, scale: number = 4) {
  const [profile, setProfile] = useState<VramProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // gpuId -1 is the "system RAM" pseudo-GPU (CPU fallback) -- there is
    // no VRAM profile to query for it.
    if (gpuId < 0) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    invoke<VramProfile>('get_vram_profile', { gpuId, tileSize, scale })
      .then((data) => {
        if (!isCancelled && data) {
          setProfile(data);
        }
      })
      .catch((err) => {
        console.error('Failed to query VRAM profile:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [gpuId, tileSize, scale]);

  return {
    profile,
    isLoading,
    // Null rather than invented figures while the backend has not answered.
    // These previously defaulted to 6.0/3.5 GB, which rendered as a precise
    // VRAM readout that was simply made up -- indistinguishable from a real
    // measurement, and wrong on every machine that wasn't a 6GB card.
    // Callers render a loading state for null instead.
    totalVramGb: profile ? profile.total_vram_mb / 1024 : null,
    usedVramGb: profile ? profile.used_vram_mb / 1024 : null,
    autoTileSize: profile ? profile.auto_tile_size : null,
    // The tile the backend will actually run, which is the requested one
    // only when it fits. Readouts must show this rather than the request.
    safeTileSize: profile ? profile.safe_tile_size : null,
    isOverflowing: profile ? profile.is_overflowing : false,
    statusMessage: profile ? profile.status_message : 'Calculating VRAM profile...',
  };
}

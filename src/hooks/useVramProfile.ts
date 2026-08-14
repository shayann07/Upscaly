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

export function useVramProfile(gpuId: number = 0, tileSize: number = 0) {
  const [profile, setProfile] = useState<VramProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    invoke<VramProfile>('get_vram_profile', { gpuId, tileSize })
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
  }, [gpuId, tileSize]);

  return {
    profile,
    isLoading,
    totalVramGb: profile ? profile.total_vram_mb / 1024 : 6.0,
    usedVramGb: profile ? profile.used_vram_mb / 1024 : 3.5,
    autoTileSize: profile ? profile.auto_tile_size : 256,
    isOverflowing: profile ? profile.is_overflowing : false,
    statusMessage: profile ? profile.status_message : 'Calculating VRAM profile...',
  };
}

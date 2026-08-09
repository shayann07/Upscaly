import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GpuInfo as GpuDevice } from '../lib/types';

export interface BackendSettings {
  default_gpu_id?: number;
  default_scale?: number;
  default_tile_size?: number;
  output_directory?: string | null;
  sound_muted?: boolean;
  auto_check_updates?: boolean;
}

export function useSettings(onGpuReady?: (gpuName: string) => void) {
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<number>(0);
  const [scale, setScale] = useState<number>(4);
  const [tileSize, setTileSize] = useState<number>(0); // 0 = Auto
  const [customOutputPath, setCustomOutputPath] = useState<string>('');

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('upscaly_sound_muted');
    return saved === 'true';
  });

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem('upscaly_sound_muted', String(next));
      return next;
    });
  };

  const gpuInitializedRef = useRef<boolean>(false);
  const isInitialLoad = useRef<boolean>(true);

  useEffect(() => {
    if (gpuInitializedRef.current) return;
    gpuInitializedRef.current = true;

    invoke<GpuDevice[]>('list_gpus')
      .then((res) => {
        setGpus(res);
        if (res.length > 0) {
          setSelectedGpu(res[0].id);
          if (onGpuReady) {
            onGpuReady(res[0].name);
          }
        }
      })
      .catch(() => {});

    invoke<BackendSettings>('get_app_settings')
      .then((saved) => {
        if (saved) {
          if (saved.default_gpu_id !== undefined) setSelectedGpu(saved.default_gpu_id);
          if (saved.default_scale !== undefined) setScale(saved.default_scale);
          if (saved.default_tile_size !== undefined) setTileSize(saved.default_tile_size);
          if (saved.output_directory) {
            setCustomOutputPath(saved.output_directory);
          } else {
            invoke<string>('get_default_output_dir')
              .then((defaultDir) => setCustomOutputPath(defaultDir))
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, [onGpuReady]);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    invoke('update_app_settings', {
      settings: {
        default_gpu_id: selectedGpu,
        default_scale: scale,
        default_tile_size: tileSize,
        output_directory: customOutputPath || null,
        sound_muted: isMuted,
        auto_check_updates: true,
      },
    }).catch(() => {});
  }, [selectedGpu, scale, tileSize, customOutputPath, isMuted]);

  return {
    gpus,
    setGpus,
    selectedGpu,
    setSelectedGpu,
    scale,
    setScale,
    tileSize,
    setTileSize,
    customOutputPath,
    setCustomOutputPath,
    isMuted,
    handleToggleMute,
  };
}

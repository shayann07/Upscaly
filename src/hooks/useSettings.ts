import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { GpuInfo as GpuDevice } from '../lib/types';
import { allowMediaPath } from '../lib/assetScope';

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
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(true);

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

  const handleSelectDestinationFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        await allowMediaPath(selected);
        setCustomOutputPath(selected);
      }
    } catch (err) {
      console.error('Failed to select destination folder:', err);
    }
  };

  const gpuInitializedRef = useRef<boolean>(false);
  // Gates the save effect below. Only flips true once both the GPU list
  // and the persisted settings have finished loading (successfully or
  // not) -- previously the save effect only skipped its very first run,
  // so `list_gpus` resolving before `get_app_settings` would fire a real
  // save with whatever partial state existed at that moment (e.g. the
  // resolved GPU choice paired with still-default scale/tileSize/output
  // directory), silently clobbering the user's actual saved preferences.
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (gpuInitializedRef.current) return;
    gpuInitializedRef.current = true;

    const gpuLoaded = invoke<GpuDevice[]>('list_gpus')
      .then((res) => {
        setGpus(res);
        if (res.length > 0) {
          const discreteGpu = res.find((g) => {
            const n = g.name.toLowerCase();
            return (
              n.includes('nvidia') ||
              n.includes('geforce') ||
              n.includes('rtx') ||
              n.includes('gtx') ||
              n.includes('radeon')
            );
          });
          const defaultChoice = discreteGpu || res[0];
          setSelectedGpu(defaultChoice.id);
          if (onGpuReady) {
            onGpuReady(defaultChoice.name);
          }
        }
      })
      .catch(() => {});

    const settingsRestored = invoke<BackendSettings>('get_app_settings')
      .then(async (saved) => {
        if (!saved) return;
        if (saved.default_gpu_id !== undefined) setSelectedGpu(saved.default_gpu_id);
        if (saved.default_scale !== undefined) setScale(saved.default_scale);
        if (saved.default_tile_size !== undefined) setTileSize(saved.default_tile_size);
        if (saved.auto_check_updates !== undefined) setAutoCheckUpdates(saved.auto_check_updates);
        if (saved.sound_muted !== undefined) {
          // The backend is the durable source of truth; localStorage only
          // exists so mute state can be read synchronously before this
          // invoke resolves (avoiding an audio flash on launch). Reconcile
          // it to match whatever the backend actually had saved.
          setIsMuted(saved.sound_muted);
          localStorage.setItem('upscaly_sound_muted', String(saved.sound_muted));
        }
        if (saved.output_directory) {
          await allowMediaPath(saved.output_directory);
          setCustomOutputPath(saved.output_directory);
        } else {
          try {
            const defaultDir = await invoke<string>('get_default_output_dir');
            await allowMediaPath(defaultDir);
            setCustomOutputPath(defaultDir);
          } catch {
            // No default dir available -- leave customOutputPath empty.
          }
        }
      })
      .catch(() => {});

    Promise.allSettled([gpuLoaded, settingsRestored]).then(() => setSettingsLoaded(true));
  }, [onGpuReady]);

  useEffect(() => {
    if (!settingsLoaded) return;
    invoke('update_app_settings', {
      settings: {
        default_gpu_id: selectedGpu,
        default_scale: scale,
        default_tile_size: tileSize,
        output_directory: customOutputPath || null,
        sound_muted: isMuted,
        auto_check_updates: autoCheckUpdates,
      },
    }).catch(() => {});
  }, [settingsLoaded, selectedGpu, scale, tileSize, customOutputPath, isMuted, autoCheckUpdates]);

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
    handleSelectDestinationFolder,
    isMuted,
    handleToggleMute,
    autoCheckUpdates,
    setAutoCheckUpdates,
  };
}

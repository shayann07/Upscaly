import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModelInfo, SUPPORTED_MODELS } from '../lib/types';

export function useModelCatalog(
  onNotify?: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void
) {
  const [supportedModels, setSupportedModels] = useState<ModelInfo[]>(SUPPORTED_MODELS);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('realesrgan-x4plus');
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const refreshInstalledModels = useCallback(() => {
    invoke<ModelInfo[]>('get_model_catalog')
      .then((catalog) => {
        if (catalog && catalog.length > 0) {
          setSupportedModels(catalog);
          const installed = catalog.filter((m) => m.installed).map((m) => m.id);
          setInstalledModels(installed);
          setSelectedModel((prev) => {
            if (installed.length > 0 && (!prev || !installed.includes(prev))) {
              return installed[0];
            }
            return prev;
          });
          return;
        }
      })
      .catch(() => {});

    invoke<string[]>('list_installed_models')
      .then((models) => {
        setInstalledModels(models);
        setSelectedModel((prev) => {
          if (models.length > 0 && (!prev || !models.includes(prev))) {
            return models[0];
          } else if (!prev) {
            return 'realesrgan-x4plus';
          }
          return prev;
        });
      })
      .catch(() => {
        setSelectedModel((prev) => prev || 'realesrgan-x4plus');
      });
  }, []);

  useEffect(() => {
    refreshInstalledModels();
  }, [refreshInstalledModels]);

  const handleDownloadModel = useCallback(
    (modelId: string) => {
      setDownloadingModelId(modelId);
      setDownloadProgress(0);

      invoke('download_model', { modelId })
        .then(() => {
          setDownloadingModelId(null);
          setDownloadProgress(100);
          refreshInstalledModels();
          if (onNotify) {
            onNotify('success', 'Model Installed', `${modelId} is ready for inference.`);
          }
        })
        .catch((err: unknown) => {
          setDownloadingModelId(null);
          if (onNotify) {
            onNotify(
              'error',
              'Download Failed',
              typeof err === 'string' ? err : 'Unknown download error'
            );
          }
        });
    },
    [refreshInstalledModels, onNotify]
  );

  const handleRepairModel = useCallback(
    (modelId: string) => {
      handleDownloadModel(modelId);
    },
    [handleDownloadModel]
  );

  return {
    supportedModels,
    setSupportedModels,
    installedModels,
    setInstalledModels,
    selectedModel,
    setSelectedModel,
    downloadingModelId,
    setDownloadingModelId,
    downloadProgress,
    setDownloadProgress,
    refreshInstalledModels,
    handleDownloadModel,
    handleRepairModel,
  };
}

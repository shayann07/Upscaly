import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModelCatalog } from '../useModelCatalog';
import { SUPPORTED_MODELS } from '../../lib/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === 'get_model_catalog') {
      return Promise.resolve(
        SUPPORTED_MODELS.map((m) => ({
          ...m,
          installed: m.id === 'realesrgan-x4plus',
        }))
      );
    }
    if (cmd === 'list_installed_models') {
      return Promise.resolve(['realesrgan-x4plus']);
    }
    if (cmd === 'download_model') {
      return Promise.resolve();
    }
    return Promise.resolve(null);
  }),
}));

describe('useModelCatalog hook', () => {
  it('initializes supported models and default selection', async () => {
    let result: { current: ReturnType<typeof useModelCatalog> };
    await act(async () => {
      const rendered = renderHook(() => useModelCatalog());
      result = rendered.result;
    });

    expect(result!.current.supportedModels.length).toBeGreaterThan(0);
    expect(result!.current.selectedModel).toBe('realesrgan-x4plus');
    expect(result!.current.downloadingModelId).toBeNull();
  });

  it('refreshes installed models from catalog', async () => {
    let result: { current: ReturnType<typeof useModelCatalog> };
    await act(async () => {
      const rendered = renderHook(() => useModelCatalog());
      result = rendered.result;
    });

    await act(async () => {
      result!.current.refreshInstalledModels();
    });

    expect(result!.current.installedModels).toContain('realesrgan-x4plus');
  });

  it('allows model selection updates', async () => {
    let result: { current: ReturnType<typeof useModelCatalog> };
    await act(async () => {
      const rendered = renderHook(() => useModelCatalog());
      result = rendered.result;
    });

    await act(async () => {
      result!.current.setSelectedModel('realesrgan-x4plus-anime');
    });

    expect(result!.current.selectedModel).toBe('realesrgan-x4plus-anime');
  });
});

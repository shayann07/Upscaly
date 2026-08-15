import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { resetStudioStore, studioActions, studioStore } from '../studioStore';
import { cancelAll, refreshCatalog, selectScale, startUpscale } from '../studioCommands';
import { StagedFile } from '../queueItem';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const mockInvoke = vi.mocked(invoke);
const state = () => studioStore.getState();

function staged(id: string): StagedFile {
  return {
    id,
    filePath: `C:/in/${id}.png`,
    fileName: `${id}.png`,
    isVideo: false,
    w: null,
    h: null,
  };
}

beforeEach(() => {
  resetStudioStore();
  mockInvoke.mockReset();
  studioActions.setGpus([{ id: 0, name: 'Test GPU', detail: 'Vulkan' }]);
});

describe('startUpscale', () => {
  it('submits every ready item and records the backend-assigned id and path', async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd !== 'run_upscale') return Promise.resolve(null);
      const input = (args as { request: { input_path: string } }).request.input_path;
      const name = input.split('/').pop();
      return Promise.resolve({ job_id: `job-${name}`, output_path: `C:/out/${name}` });
    });

    studioActions.addFiles([staged('a'), staged('b')], true);
    await startUpscale();

    // One submission path for one file or twenty -- a "single file" is a
    // queue of one, which is what removed the second, divergent start path.
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(state().items.map((i) => i.id)).toEqual(['job-a.png', 'job-b.png']);
    expect(state().items[0].outputPath).toBe('C:/out/a.png');
    expect(state().items.every((i) => i.status === 'queued')).toBe(true);
  });

  it('never sends an output file name -- only the directory', async () => {
    mockInvoke.mockResolvedValue({ job_id: 'job-1', output_path: 'C:/out/a_upscaled_4x.png' });
    studioActions.setCustomOutputPath('C:/out');
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    const request = mockInvoke.mock.calls[0][1] as { request: Record<string, unknown> };
    expect(request.request.output_dir).toBe('C:/out');
    expect(Object.keys(request.request)).not.toContain('output_path');
  });

  it('retries a previously failed item but leaves finished ones alone', async () => {
    mockInvoke.mockResolvedValue({ job_id: 'retry-1', output_path: 'C:/out/a.png' });
    studioActions.addFiles([staged('a'), staged('b')], true);
    studioStore.setState((prev) => ({
      ...prev,
      items: [
        { ...prev.items[0], status: 'failed' as const },
        { ...prev.items[1], status: 'succeeded' as const },
      ],
    }));

    await startUpscale();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(state().items[1].status).toBe('succeeded');
  });

  it('marks the row failed when the backend rejects the submission', async () => {
    mockInvoke.mockRejectedValue({
      code: 'SIDECAR_NOT_FOUND',
      message: "Sidecar binary not found at 'realesrgan.exe'",
      suggestion: 'Verify binary path',
    });
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    expect(state().items[0].status).toBe('failed');
    // A structured AppError must be rendered as its message, not as
    // "[object Object]" -- which is what String(err) would produce now that
    // commands reject with a typed error rather than a string.
    expect(state().items[0].error).toContain('Sidecar binary not found');
  });

  it('refuses to start with no GPU available', async () => {
    studioActions.setGpus([]);
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(state().items[0].status).toBe('ready');
  });
});

describe('cancelAll', () => {
  it('cancels every non-terminal item by its own job id', async () => {
    mockInvoke.mockResolvedValue(null);
    studioActions.addFiles([staged('a'), staged('b'), staged('c')], true);
    studioStore.setState((prev) => ({
      ...prev,
      items: [
        { ...prev.items[0], status: 'running' as const },
        { ...prev.items[1], status: 'queued' as const },
        { ...prev.items[2], status: 'succeeded' as const },
      ],
    }));

    await cancelAll();

    const cancelled = mockInvoke.mock.calls
      .filter(([cmd]) => cmd === 'cancel_upscale')
      .map(([, args]) => (args as { jobId: string }).jobId);
    expect(cancelled.sort()).toEqual(['a', 'b']);
  });
});

describe('refreshCatalog', () => {
  it('mirrors the backend catalog and marks what is installed', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd !== 'get_model_catalog') return Promise.resolve([]);
      return Promise.resolve([
        { id: 'model-a', name: 'A', note: '', cat: 'photo', scale: 4, size: '1MB', speed: 1 },
        {
          id: 'model-b',
          name: 'B',
          note: '',
          cat: 'anime',
          scale: 2,
          size: '1MB',
          speed: 1,
          installed: true,
        },
      ]);
    });

    await refreshCatalog();

    expect(state().supportedModels).toHaveLength(2);
    expect(state().installedModels).toEqual(['model-b']);
    // The default selection is not installed, so it moves to one that is
    // rather than leaving a model selected that cannot run.
    expect(state().selectedModel).toBe('model-b');
  });

  it('falls back to the installed-model list when the catalog is unavailable', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'get_model_catalog') return Promise.reject(new Error('no catalog'));
      if (cmd === 'list_installed_models') return Promise.resolve(['realesrgan-x4plus-anime']);
      return Promise.resolve([]);
    });

    await refreshCatalog();

    expect(state().installedModels).toEqual(['realesrgan-x4plus-anime']);
    expect(state().selectedModel).toBe('realesrgan-x4plus-anime');
  });

  it('leaves a still-installed selection alone', async () => {
    studioActions.setSelectedModel('keeper');
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'get_model_catalog') return Promise.reject(new Error('no catalog'));
      if (cmd === 'list_installed_models') return Promise.resolve(['keeper', 'other']);
      return Promise.resolve([]);
    });

    await refreshCatalog();

    expect(state().selectedModel).toBe('keeper');
  });
});

describe('scale and model stay consistent', () => {
  it('swaps to a model that can serve the requested scale', () => {
    // Models are fixed-factor, so asking for 2x while a 4x model is
    // selected has to move the selection too.
    studioActions.setSelectedModel('realesrgan-x4plus');
    selectScale(2);

    expect(state().scale).toBe(2);
    const chosen = state().supportedModels.find((m) => m.id === state().selectedModel);
    expect(chosen?.scale).toBe(2);
  });

  it('leaves the model alone when it already matches the scale', () => {
    studioActions.setSelectedModel('realesrgan-x4plus');
    selectScale(4);
    expect(state().selectedModel).toBe('realesrgan-x4plus');
  });
});

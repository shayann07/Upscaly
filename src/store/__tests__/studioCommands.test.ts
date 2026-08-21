import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { resetStudioStore, studioActions, studioStore } from '../studioStore';
import {
  cancelAll,
  checkResumableJobs,
  confirmSlowRunAndStart,
  dismissOfferedResume,
  downloadModel,
  openFolder,
  resumeOfferedJob,
  refreshCatalog,
  retryItem,
  selectScale,
  startUpscale,
} from '../studioCommands';
import { StagedFile } from '../queueItem';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('../../lib/media', () => ({
  getMediaDimensions: vi.fn().mockResolvedValue({ w: 800, h: 600 }),
  getMediaSrc: (path: string) => path,
}));

vi.mock('../../lib/sound', () => ({
  playDropSound: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
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
  // The default state of an app that has been used: the selected model is
  // downloaded. Models ship on demand rather than bundled, so tests that
  // exercise submission have to say so -- the ones that care about the
  // empty first-run state override this.
  studioActions.setInstalledModels(['realesrgan-x4plus']);
});

describe('startUpscale', () => {
  it('submits the whole run in one call so the queue can group it', async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd !== 'run_upscale_batch') return Promise.resolve(null);
      const requests = (args as { requests: { input_path: string }[] }).requests;
      return Promise.resolve(
        requests.map((r) => {
          const name = r.input_path.split('/').pop();
          return { job_id: `job-${name}`, output_path: `C:/out/${name}` };
        })
      );
    });

    studioActions.addFiles([staged('a'), staged('b')], true);
    await startUpscale();

    // One call, not one per item: the backend starts the first job the
    // instant it is enqueued, so submitting serially would mean no two
    // images ever arrived close enough together to share a process.
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][0]).toBe('run_upscale_batch');
    expect(state().items.map((i) => i.id)).toEqual(['job-a.png', 'job-b.png']);
    expect(state().items[0].outputPath).toBe('C:/out/a.png');
    expect(state().items.every((i) => i.status === 'queued')).toBe(true);
  });

  it('never sends an output file name -- only the directory', async () => {
    mockInvoke.mockResolvedValue([{ job_id: 'job-1', output_path: 'C:/out/a_upscaled_4x.png' }]);
    studioActions.setCustomOutputPath('C:/out');
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    const { requests } = mockInvoke.mock.calls[0][1] as { requests: Record<string, unknown>[] };
    expect(requests[0].output_dir).toBe('C:/out');
    expect(Object.keys(requests[0])).not.toContain('output_path');
  });

  it('sends compatible items together so the backend can share one process', async () => {
    mockInvoke.mockResolvedValue([
      { job_id: 'job-a', output_path: 'C:/out/a.png' },
      { job_id: 'job-b', output_path: 'C:/out/b.png' },
      { job_id: 'job-c', output_path: 'C:/out/c.png' },
    ]);
    studioActions.addFiles([staged('a'), staged('b'), staged('c')], true);

    await startUpscale();

    const { requests } = mockInvoke.mock.calls[0][1] as {
      requests: { model_id: string; gpu_id: number; scale: number; tile_size: number }[];
    };
    expect(requests).toHaveLength(3);
    // Everything in one submission shares the settings that decide
    // groupability, so the backend can put them in one process.
    expect(new Set(requests.map((r) => r.model_id)).size).toBe(1);
    expect(new Set(requests.map((r) => r.scale)).size).toBe(1);
    expect(new Set(requests.map((r) => r.tile_size)).size).toBe(1);
    expect(new Set(requests.map((r) => r.gpu_id)).size).toBe(1);
  });

  it('sends the chosen preset so the backend knows whether to pass -x', async () => {
    mockInvoke.mockResolvedValue([{ job_id: 'job-a', output_path: 'C:/out/a.png' }]);
    studioActions.setPreset('quality');
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    const { requests } = mockInvoke.mock.calls[0][1] as { requests: { preset: string }[] };
    // Without this the backend falls back to Balanced and the run silently
    // ignores the preset the user picked -- succeeding, with no TTA and no
    // sign that anything was dropped.
    expect(requests[0].preset).toBe('quality');
  });

  it('will not start a Quality video run without confirming the cost first', async () => {
    // TTA runs every tile 8 times. On a 294-frame clip that is hours rather
    // than minutes, and the previous warning was a progress-line write that
    // the poll loop overwrote within 300ms -- so the user saw a job that was
    // inexplicably slow and nothing explaining why.
    mockInvoke.mockResolvedValue([{ job_id: 'job-v', output_path: 'C:/out/v.mp4' }]);
    studioActions.setPreset('quality');
    studioActions.addFiles([{ ...staged('v'), isVideo: true }], true);

    await startUpscale();

    expect(mockInvoke).not.toHaveBeenCalledWith('run_upscale_batch', expect.anything());
    expect(state().confirmSlowRunOpen).toBe(true);

    await confirmSlowRunAndStart();

    expect(mockInvoke).toHaveBeenCalledWith('run_upscale_batch', expect.anything());
    expect(state().confirmSlowRunOpen).toBe(false);
  });

  it('does not interrupt a Quality run on images, or a video run on Balanced', async () => {
    // The cost only bites on video. Asking every time would train the user
    // to click through the one case that matters.
    mockInvoke.mockResolvedValue([{ job_id: 'job-a', output_path: 'C:/out/a.png' }]);
    studioActions.setPreset('quality');
    studioActions.addFiles([staged('a')], true);
    await startUpscale();
    expect(state().confirmSlowRunOpen).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith('run_upscale_batch', expect.anything());

    resetStudioStore();
    mockInvoke.mockClear();
    studioActions.setGpus([{ id: 0, name: 'Test GPU', detail: 'Vulkan' }]);
    // resetStudioStore wipes the fixture's installed models too.
    studioActions.setInstalledModels(['realesrgan-x4plus']);
    studioActions.setPreset('balanced');
    studioActions.addFiles([{ ...staged('v'), isVideo: true }], true);
    await startUpscale();
    expect(state().confirmSlowRunOpen).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith('run_upscale_batch', expect.anything());
  });

  it('retries a previously failed item but leaves finished ones alone', async () => {
    mockInvoke.mockResolvedValue([{ job_id: 'retry-1', output_path: 'C:/out/a.png' }]);
    studioActions.addFiles([staged('a'), staged('b')], true);
    studioStore.setState((prev) => ({
      ...prev,
      items: [
        { ...prev.items[0], status: 'failed' as const },
        { ...prev.items[1], status: 'succeeded' as const },
      ],
    }));

    await startUpscale();

    const { requests } = mockInvoke.mock.calls[0][1] as { requests: unknown[] };
    expect(requests).toHaveLength(1);
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

  it('sends a fresh install to the Models tab instead of a broken run', async () => {
    // Models are downloaded on demand now, so an empty models directory is
    // the normal state of a first launch. Submitting anyway would spawn an
    // engine that dies on a missing .param and surface as an opaque
    // execution error -- a terrible first thing for a new user to meet.
    mockInvoke.mockResolvedValue([]);
    studioActions.setInstalledModels([]);
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    expect(mockInvoke).not.toHaveBeenCalledWith('run_upscale_batch', expect.anything());
    expect(state().activeNavTab).toBe('models');
    expect(state().items[0].status).toBe('ready');
  });

  it('will not run a model the user has not downloaded yet', async () => {
    mockInvoke.mockResolvedValue([]);
    studioActions.setInstalledModels(['realesrgan-x4plus-anime']);
    studioActions.setSelectedModel('remacri-4x');
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    expect(mockInvoke).not.toHaveBeenCalledWith('run_upscale_batch', expect.anything());
    expect(state().activeNavTab).toBe('models');
  });

  it('refuses to start with no GPU available', async () => {
    studioActions.setGpus([]);
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(state().items[0].status).toBe('ready');
  });
});

describe('crash recovery', () => {
  const OFFER = {
    job_id: 'job-crashed',
    file_name: 'test_1.mp4',
    input_path: 'C:/in/test_1.mp4',
    output_path: 'C:/out/test_1_upscaled_4x.mp4',
    model_name: 'realesrgan-x4plus',
    scale: 4,
    frames_done: 210,
  };

  it('surfaces crashed work found by the backend scan', async () => {
    mockInvoke.mockImplementation((cmd) =>
      Promise.resolve(cmd === 'list_resumable_jobs' ? [OFFER] : [])
    );

    await checkResumableJobs();

    expect(state().resumableJobs).toHaveLength(1);
    expect(state().resumableJobs[0].frames_done).toBe(210);
  });

  it('resumes by id only -- the backend re-reads its own manifest', async () => {
    mockInvoke.mockResolvedValue({ job_id: 'job-crashed', output_path: OFFER.output_path });
    studioActions.setResumableJobs([OFFER]);

    await resumeOfferedJob();

    expect(mockInvoke).toHaveBeenCalledWith('resume_video_job', { jobId: 'job-crashed' });
    // The offer is consumed either way; the queue row arrives via the
    // backend's snapshot delta, not from anything staged here.
    expect(state().resumableJobs).toHaveLength(0);
  });

  it('declining keeps the work on disk for a later launch', () => {
    studioActions.setResumableJobs([OFFER]);

    dismissOfferedResume();

    expect(state().resumableJobs).toHaveLength(0);
    // "Not now" must not delete anything: no discard call was made.
    expect(mockInvoke).not.toHaveBeenCalledWith('discard_resumable_job', expect.anything());
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
  it('never leaves the category to satisfy a scale', () => {
    // The regression this guards: the only 2x model in the catalog is
    // realesr-animevideov3-x2, an anime *video* model. Falling through to
    // "any model at this factor" meant asking for 2x on a photograph
    // silently ran it through that model -- the job succeeded, the file
    // appeared, and faces came out flat and waxy with nothing reporting
    // that the model had been swapped.
    studioActions.setSelectedModel('realesrgan-x4plus');
    selectScale(2);

    expect(state().selectedModel).toBe('realesrgan-x4plus');
    // And it says so, rather than leaving the user to infer it from the
    // output looking wrong.
    expect(state().toasts.some((toast) => toast.message.includes('4×'))).toBe(true);
  });

  it('swaps within the category when that category can serve the scale', () => {
    // The video models do come in 2x/3x/4x, so here the swap is correct
    // and stays inside the content type it was trained for.
    studioActions.setSelectedModel('realesr-animevideov3-x4');
    selectScale(2);

    expect(state().selectedModel).toBe('realesr-animevideov3-x2');
    const chosen = state().supportedModels.find((m) => m.id === state().selectedModel);
    expect(chosen?.cat).toBe('video');
  });

  it('leaves the model alone when it already matches the scale', () => {
    studioActions.setSelectedModel('realesrgan-x4plus');
    selectScale(4);
    expect(state().selectedModel).toBe('realesrgan-x4plus');
  });
});

describe('machines with no compatible GPU', () => {
  function stagedVideo(id: string): StagedFile {
    return {
      id,
      filePath: `C:/in/${id}.mp4`,
      fileName: `${id}.mp4`,
      isVideo: true,
      w: null,
      h: null,
    };
  }

  it('refuses video outright rather than starting a job that would run for days', async () => {
    // Real-ESRGAN on ncnn's CPU path takes minutes per 1080p frame, so even
    // a short clip runs for days. Accepting the job would not be "slow but
    // working" -- it would be hours of waiting for nothing.
    studioActions.setCpuOnly(true);
    studioActions.addFiles([stagedVideo('clip')], true);

    await startUpscale();

    expect(mockInvoke).not.toHaveBeenCalledWith('run_upscale_batch', expect.anything());
    expect(state().toasts.some((t) => t.message.includes('Video needs a GPU'))).toBe(true);
  });

  it('still allows images through', async () => {
    // The whole point of the CPU path: the app remains usable for stills on
    // a machine with no Vulkan device, instead of failing at the engine.
    mockInvoke.mockResolvedValue([{ job_id: 'job-a', output_path: 'C:/out/a.png' }]);
    studioActions.setCpuOnly(true);
    studioActions.addFiles([staged('a')], true);

    await startUpscale();

    expect(mockInvoke).toHaveBeenCalledWith('run_upscale_batch', expect.anything());
  });

  it('does not block video when a GPU is present', async () => {
    mockInvoke.mockResolvedValue([{ job_id: 'job-clip', output_path: 'C:/out/clip.mp4' }]);
    studioActions.setCpuOnly(false);
    studioActions.addFiles([stagedVideo('clip')], true);

    await startUpscale();

    expect(mockInvoke).toHaveBeenCalledWith('run_upscale_batch', expect.anything());
  });
});

describe('downloadModel', () => {
  it('tracks two concurrent downloads independently, not through one shared slot', async () => {
    // The bug this guards: `downloadingModelId`/`downloadProgress` used to
    // be a single pair shared by every row, so two real downloads in
    // flight at once stomped on each other's visible state. Each id must
    // now keep its own entry regardless of what else is running.
    let resolveA: (() => void) | undefined;
    let resolveB: (() => void) | undefined;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'download_model') {
        // Neither promise settles until the assertions below have had a
        // chance to observe both downloads in flight together.
        return new Promise<void>((resolve) => {
          if (!resolveA) resolveA = resolve;
          else resolveB = resolve;
        });
      }
      if (cmd === 'get_model_catalog') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    const a = downloadModel('model-a');
    const b = downloadModel('model-b');
    // Both invokes fire synchronously up to their first await, so both
    // ids are already registered by the time either promise is examined.
    await Promise.resolve();

    expect(state().downloadingModels).toEqual({ 'model-a': 0, 'model-b': 0 });

    resolveA?.();
    await a;

    // Model A finishing must not touch model B's entry -- the single-slot
    // version cleared the shared field unconditionally in `finally`,
    // which would have wiped model B out here while it was still running.
    expect(state().downloadingModels).toEqual({ 'model-b': 0 });

    resolveB?.();
    await b;

    expect(state().downloadingModels).toEqual({});
  });

  it('refuses to re-trigger a model whose download is already in flight', async () => {
    // The frontend guard mirrored against the backend's per-model lock
    // (engine/model_store.rs): the Download button is hidden while a
    // model's own entry exists, but a stale click queued before the row
    // re-rendered must not fire a second invoke -- the backend has no
    // second writer to protect against a fixed temp-file path otherwise.
    let calls = 0;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'download_model') {
        calls += 1;
        return new Promise(() => {}); // never resolves within this test
      }
      return Promise.resolve(undefined);
    });

    void downloadModel('model-a');
    await Promise.resolve();
    void downloadModel('model-a');
    await Promise.resolve();

    expect(calls).toBe(1);
  });
});

describe('openFolder', () => {
  it('enumerates media files inside folder and adds them to queue', async () => {
    mockOpen.mockResolvedValue('C:/MyFolder' as unknown as string[] | string | null);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'allow_media_path') return Promise.resolve();
      if (cmd === 'list_media_files') {
        return Promise.resolve(['C:/MyFolder/photo1.jpg', 'C:/MyFolder/photo2.png']);
      }
      return Promise.resolve();
    });

    await openFolder();

    expect(mockInvoke).toHaveBeenCalledWith('list_media_files', { path: 'C:/MyFolder' });
    expect(state().items.length).toBe(2);
    expect(state().items[0].fileName).toBe('photo1.jpg');
    expect(state().items[1].fileName).toBe('photo2.png');
  });

  it('notifies warning when folder has no media files', async () => {
    mockOpen.mockResolvedValue('C:/EmptyFolder' as unknown as string[] | string | null);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'allow_media_path') return Promise.resolve();
      if (cmd === 'list_media_files') return Promise.resolve([]);
      return Promise.resolve();
    });

    await openFolder();

    expect(state().items.length).toBe(0);
    expect(state().toasts.length).toBe(1);
    expect(state().toasts[0].type).toBe('warning');
    expect(state().toasts[0].message).toContain('No Media Found');
  });
});

describe('retryItem', () => {
  it('resets failed item to ready and re-submits upscale', async () => {
    studioActions.addFiles([staged('failed-item')], true);
    studioActions.updateItem('failed-item', {
      status: 'failed',
      error: 'Sidecar crashed',
      progress: 45,
    });

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'allow_media_path') return Promise.resolve();
      if (cmd === 'run_upscale_batch') {
        return Promise.resolve([{ job_id: 'job-123', output_path: 'C:/out/failed-item.png' }]);
      }
      return Promise.resolve();
    });

    await retryItem('failed-item');

    expect(mockInvoke).toHaveBeenCalledWith('run_upscale_batch', expect.any(Object));
    expect(state().items[0].error).toBeNull();
  });
});

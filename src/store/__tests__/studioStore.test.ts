import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { jobSnapshot } from '../../test/jobSnapshot';
import { MAX_VISIBLE_TOASTS } from '../../lib/types';
import { resetStudioStore, studioActions, studioStore } from '../studioStore';
import { selectProgressItem, selectSelectedItem } from '../selectors';
import { StagedFile } from '../queueItem';

const state = () => studioStore.getState();

function staged(id: string, over: Partial<StagedFile> = {}): StagedFile {
  return {
    id,
    filePath: `C:/in/${id}.png`,
    fileName: `${id}.png`,
    isVideo: false,
    w: null,
    h: null,
    ...over,
  };
}

beforeEach(() => {
  resetStudioStore();
});

describe('the queue is a single store', () => {
  it('reads back the items that were written to it', () => {
    // The bug this replaces: two hooks each owned a `batchItems` store and
    // the composition root's spread order decided which one won, so writes
    // went to one copy and reads came from the other -- which made batch
    // mode unreachable. There is one store now, so this is a tautology, and
    // that is the point.
    studioActions.addFiles([staged('a'), staged('b')], true);

    expect(state().items).toHaveLength(2);
    expect(state().items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(state().selectedId).toBe('a');
    expect(state().items[0].status).toBe('ready');
  });

  it('replaces the queue for a single pick and appends for a multi-pick', () => {
    studioActions.addFiles([staged('a')], true);
    studioActions.addFiles([staged('b'), staged('c')], false);
    expect(state().items.map((i) => i.id)).toEqual(['a', 'b', 'c']);

    studioActions.addFiles([staged('d')], true);
    expect(state().items.map((i) => i.id)).toEqual(['d']);
  });

  it('moves the selection off a removed item instead of stranding it', () => {
    studioActions.addFiles([staged('a'), staged('b')], true);
    studioActions.selectItem('b');

    studioActions.removeItem('b');
    expect(state().selectedId).toBe('a');

    studioActions.removeItem('a');
    expect(state().selectedId).toBeNull();
  });
});

describe('backend snapshots are the only writer of job state', () => {
  it('applies a delta to the matching row', () => {
    studioActions.addFiles([staged('local-1')], true);
    studioActions.markSubmitted('local-1', 'job-1', 'C:/out/job-1.png');

    studioActions.applySnapshots([
      jobSnapshot({ job_id: 'job-1', status: 'running', percentage: 42, phase: 'Upscaling' }),
    ]);

    const item = state().items[0];
    expect(item.id).toBe('job-1');
    expect(item.status).toBe('running');
    expect(item.progress).toBe(42);
    expect(item.phase).toBe('Upscaling');
  });

  it('refuses a late delta that would revive a finished row', () => {
    studioActions.addFiles([staged('job-1')], true);
    studioActions.applySnapshots([jobSnapshot({ job_id: 'job-1', status: 'running' })]);
    studioActions.applySnapshots([
      jobSnapshot({ job_id: 'job-1', status: 'succeeded', percentage: 100 }),
    ]);

    // Out-of-order delivery, or a duplicate tick from a process that was
    // already reaped. Applying it would show a progress bar with no job
    // behind it.
    studioActions.applySnapshots([
      jobSnapshot({ job_id: 'job-1', status: 'running', percentage: 61 }),
    ]);

    expect(state().items[0].status).toBe('succeeded');
    expect(state().items[0].progress).toBe(100);
  });

  it('folds in a delta that arrived before the job id came back', () => {
    studioActions.addFiles([staged('local-1'), staged('local-2')], true);
    studioActions.selectItem('local-1');

    // The backend registers the job and flushes its first delta before
    // run_upscale's promise resolves, so this snapshot can genuinely land
    // while the caller still knows the row only by its staged id.
    studioActions.applySnapshots([jobSnapshot({ job_id: 'job-1', status: 'running' })]);
    expect(state().items).toHaveLength(3);

    studioActions.markSubmitted('local-1', 'job-1', 'C:/out/job-1.png');

    // One row, in its original queue position, with the progress the
    // backend already reported and the selection still pointing at it.
    expect(state().items).toHaveLength(2);
    expect(state().items.map((i) => i.id)).toEqual(['job-1', 'local-2']);
    expect(state().items[0].status).toBe('running');
    expect(state().selectedId).toBe('job-1');
  });

  it('carries the selection across the staged-to-job-id rename', () => {
    studioActions.addFiles([staged('a'), staged('local-2')], true);
    studioActions.selectItem('local-2');

    studioActions.markSubmitted('local-2', 'job-2', 'C:/out/job-2.png');

    expect(state().selectedId).toBe('job-2');
    expect(selectSelectedItem(state())?.id).toBe('job-2');
  });

  it('inserts a job the queue has never seen rather than dropping it', () => {
    // What `get_jobs_snapshot()` returns after a reload: jobs that are
    // already running and that this session never staged.
    studioActions.applySnapshots([
      jobSnapshot({
        job_id: 'orphan',
        status: 'running',
        percentage: 10,
        input_path: 'C:/in/orphan.png',
        file_name: 'orphan.png',
      }),
    ]);

    expect(state().items).toHaveLength(1);
    expect(state().items[0].fileName).toBe('orphan.png');
    expect(state().selectedId).toBe('orphan');
  });

  it('takes the output path from the backend and never invents one', () => {
    studioActions.addFiles([staged('job-1')], true);
    studioActions.applySnapshots([
      jobSnapshot({
        job_id: 'job-1',
        status: 'running',
        output_path: 'C:/out/job-1_upscaled_4x (1).png',
      }),
    ]);

    expect(state().items[0].outputPath).toBe('C:/out/job-1_upscaled_4x (1).png');
  });

  it('leaves unprobed dimensions null rather than filling in a plausible number', () => {
    studioActions.addFiles([staged('a')], true);
    expect(state().items[0].w).toBeNull();
    expect(state().items[0].h).toBeNull();

    studioActions.setItemDimensions('a', 1280, 720);
    expect(state().items[0].w).toBe(1280);
  });
});

describe('derived selectors', () => {
  it('reports the selected row as the studio view state', () => {
    studioActions.addFiles([staged('a'), staged('b')], true);
    studioActions.applySnapshots([jobSnapshot({ job_id: 'a', status: 'running', percentage: 30 })]);

    expect(selectSelectedItem(state())?.id).toBe('a');
    expect(selectSelectedItem(state())?.status).toBe('running');
  });

  it('keeps the overlay on the running job when a queued row is selected', () => {
    studioActions.addFiles([staged('a'), staged('b')], true);
    studioActions.applySnapshots([
      jobSnapshot({ job_id: 'a', status: 'running', percentage: 30 }),
      jobSnapshot({ job_id: 'b', status: 'queued' }),
    ]);
    studioActions.selectItem('b');

    // Clicking a queued row mid-batch must not blank the progress of the
    // job that is actually in flight.
    expect(selectProgressItem(state())?.id).toBe('a');
  });
});

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes an identical notification while the first is still visible', () => {
    studioActions.notify('info', 'Title', 'Body');
    studioActions.notify('info', 'Title', 'Body');
    expect(state().toasts).toHaveLength(1);
  });

  it('auto-dismisses a toast after its lifetime elapses', () => {
    studioActions.notify('info', 'Title', 'Body');
    expect(state().toasts).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(state().toasts).toHaveLength(0);
  });

  it('allows an identical notification again once the prior toast expired', () => {
    studioActions.notify('info', 'Title', 'Body');
    vi.advanceTimersByTime(5000);
    expect(state().toasts).toHaveLength(0);

    studioActions.notify('info', 'Title', 'Body');
    expect(state().toasts).toHaveLength(1);
  });

  it('caps the store at the number of toasts that actually render', () => {
    for (let i = 0; i < 5; i += 1) {
      studioActions.notify('info', `Title ${i}`, 'Body');
    }
    // An entry the user cannot see must not linger in dedupe state.
    expect(state().toasts).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(state().toasts.map((t) => t.message)).toEqual([
      'Title 2: Body',
      'Title 3: Body',
      'Title 4: Body',
    ]);
  });

  it('does not let an evicted off-screen toast suppress a visible one', () => {
    studioActions.notify('info', 'Repeat', 'Body');
    for (let i = 0; i < MAX_VISIBLE_TOASTS; i += 1) {
      studioActions.notify('info', `Filler ${i}`, 'Body');
    }
    expect(state().toasts.some((t) => t.message === 'Repeat: Body')).toBe(false);

    studioActions.notify('info', 'Repeat', 'Body');
    expect(state().toasts.some((t) => t.message === 'Repeat: Body')).toBe(true);
  });
});

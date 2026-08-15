import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStudioJobStatus, StudioJobState, JobInputSnapshot } from '../studioJobHandler';
import { JobSnapshot } from '../types';
import { jobSnapshot } from '../../test/jobSnapshot';
import { getRecentHistory, clearHistory } from '../history';

vi.mock('../assetScope', () => ({
  allowMediaPath: vi.fn(),
}));

vi.mock('../sound', () => ({
  playCompleteSound: vi.fn(),
  playErrorSound: vi.fn(),
}));

function buildState(overrides: Partial<StudioJobState> = {}): StudioJobState {
  return {
    activeJobId: null,
    activeJobIdRef: { current: null },
    jobSnapshotsRef: { current: new Map<string, JobInputSnapshot>() },
    pendingOutputPath: { current: '' },
    upscaledPath: '',
    selectedModel: 'realesrgan-x4plus',
    fileName: '',
    filePath: '',
    scale: 4,
    isVideo: false,
    isMuted: true,
    setActiveJobId: vi.fn(),
    setProgressVal: vi.fn(),
    setJobStatus: vi.fn(),
    setJobPhase: vi.fn(),
    setEtaSeconds: vi.fn(),
    setFps: vi.fn(),
    setStatusMessage: vi.fn(),
    setUpscaledPath: vi.fn(),
    setHistoryItems: vi.fn(),
    refreshInstalledModels: vi.fn(),
    onNotify: vi.fn(),
    ...overrides,
  };
}

function progressFor(jobId: string, overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return jobSnapshot({ job_id: jobId, percentage: 100, status: 'succeeded', ...overrides });
}

describe('handleStudioJobStatus', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('ignores progress for a job id it never started (no snapshot)', () => {
    const state = buildState();
    handleStudioJobStatus(progressFor('unknown-job', { status: 'running', percentage: 40 }), state);
    expect(state.setProgressVal).not.toHaveBeenCalled();
  });

  it('drives live UI state for the currently active job', () => {
    const state = buildState({
      activeJobIdRef: { current: 'job-1' },
      filePath: 'C:/in/a.png',
      fileName: 'a.png',
    });
    state.jobSnapshotsRef.current.set('job-1', {
      filePath: 'C:/in/a.png',
      fileName: 'a.png',
      isVideo: false,
    });

    handleStudioJobStatus(progressFor('job-1', { status: 'running', percentage: 40 }), state);
    expect(state.setProgressVal).toHaveBeenCalledWith(40);
    expect(state.setJobStatus).toHaveBeenCalledWith('running');
  });

  it('does not overwrite the view when a different file was opened before completion', () => {
    // Simulates opening file A, starting a job on it, then opening file B
    // without starting a new job -- activeJobIdRef is untouched by file
    // selection, so the job is still nominally "active" by id, but the
    // live view has moved on to a different file.
    const state = buildState({
      activeJobIdRef: { current: 'job-1' },
      filePath: 'C:/in/b.png', // user has since opened a different file
      fileName: 'b.png',
      pendingOutputPath: { current: 'C:/out/a_upscaled_4x.png' },
    });
    state.jobSnapshotsRef.current.set('job-1', {
      filePath: 'C:/in/a.png',
      fileName: 'a.png',
      isVideo: false,
    });

    handleStudioJobStatus(
      progressFor('job-1', {
        status: 'succeeded',
        percentage: 100,
        output_path: 'C:/out/a_upscaled_4x.png',
      }),
      state
    );

    // The view must not flip to show job-1's result on top of file B.
    expect(state.setUpscaledPath).not.toHaveBeenCalled();
    expect(state.setStatusMessage).not.toHaveBeenCalled();
    // But the history entry must still be recorded, correctly attributed
    // to file A (the job's own snapshot), not file B (the live state).
    const history = getRecentHistory();
    expect(history).toHaveLength(1);
    expect(history[0].fileName).toBe('a.png');
    expect(history[0].originalPath).toBe('C:/in/a.png');
    expect(history[0].upscaledPath).toBe('C:/out/a_upscaled_4x.png');
  });

  it('still records history for a job superseded by a newer one before it finished', () => {
    const state = buildState({
      activeJobIdRef: { current: 'job-2' }, // a second job has since started
      filePath: 'C:/in/b.png',
      fileName: 'b.png',
    });
    state.jobSnapshotsRef.current.set('job-1', {
      filePath: 'C:/in/a.png',
      fileName: 'a.png',
      isVideo: false,
    });
    state.jobSnapshotsRef.current.set('job-2', {
      filePath: 'C:/in/b.png',
      fileName: 'b.png',
      isVideo: false,
    });

    handleStudioJobStatus(
      progressFor('job-1', { status: 'succeeded', output_path: 'C:/out/a_upscaled_4x.png' }),
      state
    );

    expect(state.setUpscaledPath).not.toHaveBeenCalled();
    expect(state.setActiveJobId).not.toHaveBeenCalledWith(null);
    const history = getRecentHistory();
    expect(history[0].fileName).toBe('a.png');
    // job-2's snapshot must be untouched -- only job-1 was consumed.
    expect(state.jobSnapshotsRef.current.has('job-1')).toBe(false);
    expect(state.jobSnapshotsRef.current.has('job-2')).toBe(true);
  });

  it('clears activeJobId only when the completing job is the active one', () => {
    const state = buildState({
      activeJobIdRef: { current: 'job-1' },
      filePath: 'C:/in/a.png',
      fileName: 'a.png',
    });
    state.jobSnapshotsRef.current.set('job-1', {
      filePath: 'C:/in/a.png',
      fileName: 'a.png',
      isVideo: false,
    });

    handleStudioJobStatus(
      progressFor('job-1', { status: 'succeeded', output_path: 'C:/out/a_upscaled_4x.png' }),
      state
    );

    expect(state.setUpscaledPath).toHaveBeenCalledWith('C:/out/a_upscaled_4x.png');
    expect(state.setActiveJobId).toHaveBeenCalledWith(null);
    expect(state.activeJobIdRef.current).toBeNull();
  });
});

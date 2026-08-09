export type JobState = 'ready' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export function isTerminalState(state: JobState | string): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}

export function normalizeJobStatus(rawStatus: string): JobState {
  const s = rawStatus.trim().toLowerCase();
  switch (s) {
    case 'ready':
    case 'idle':
      return 'ready';
    case 'queued':
      return 'queued';
    case 'running':
    case 'processing':
      return 'running';
    case 'succeeded':
    case 'done':
    case 'completed':
      return 'succeeded';
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'failed';
  }
}

export function isValidStateTransition(from: JobState, to: JobState): boolean {
  if (from === to) return true;
  if (isTerminalState(from)) return false; // terminal states cannot transition back to active
  if (from === 'ready') return to === 'queued' || to === 'running' || to === 'cancelled';
  if (from === 'queued') return to === 'running' || to === 'cancelled' || to === 'failed';
  if (from === 'running') return to === 'succeeded' || to === 'failed' || to === 'cancelled';
  return false;
}

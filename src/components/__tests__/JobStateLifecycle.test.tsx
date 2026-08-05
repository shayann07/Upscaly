import { describe, it, expect } from 'vitest';
import { JobState, isTerminalState, isValidStateTransition } from '../../lib/types';

describe('Job State Lifecycle Requirements', () => {
  it('identifies terminal states correctly', () => {
    expect(isTerminalState('succeeded')).toBe(true);
    expect(isTerminalState('failed')).toBe(true);
    expect(isTerminalState('cancelled')).toBe(true);

    expect(isTerminalState('queued')).toBe(false);
    expect(isTerminalState('running')).toBe(false);
    expect(isTerminalState('ready')).toBe(false);
  });

  it('permits valid state transitions', () => {
    expect(isValidStateTransition('ready', 'queued')).toBe(true);
    expect(isValidStateTransition('queued', 'running')).toBe(true);
    expect(isValidStateTransition('queued', 'cancelled')).toBe(true);
    expect(isValidStateTransition('running', 'succeeded')).toBe(true);
    expect(isValidStateTransition('running', 'failed')).toBe(true);
    expect(isValidStateTransition('running', 'cancelled')).toBe(true);
  });

  it('rejects invalid state transitions (terminal states returning to active)', () => {
    const terminalStates: JobState[] = ['succeeded', 'failed', 'cancelled'];
    const activeStates: JobState[] = ['ready', 'queued', 'running'];

    for (const term of terminalStates) {
      for (const act of activeStates) {
        expect(isValidStateTransition(term, act)).toBe(false);
      }
    }
  });

  it('prevents cancellation from mapping back to queued', () => {
    expect(isValidStateTransition('cancelled', 'queued')).toBe(false);
  });
});

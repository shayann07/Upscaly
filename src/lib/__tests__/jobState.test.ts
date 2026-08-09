import { describe, it, expect } from 'vitest';
import { JobState, isTerminalState, normalizeJobStatus, isValidStateTransition } from '../jobState';

describe('jobState module', () => {
  describe('normalizeJobStatus', () => {
    it('normalizes valid state strings correctly', () => {
      expect(normalizeJobStatus('ready')).toBe('ready');
      expect(normalizeJobStatus('idle')).toBe('ready');
      expect(normalizeJobStatus('queued')).toBe('queued');
      expect(normalizeJobStatus('running')).toBe('running');
      expect(normalizeJobStatus('processing')).toBe('running');
      expect(normalizeJobStatus('succeeded')).toBe('succeeded');
      expect(normalizeJobStatus('done')).toBe('succeeded');
      expect(normalizeJobStatus('completed')).toBe('succeeded');
      expect(normalizeJobStatus('failed')).toBe('failed');
      expect(normalizeJobStatus('error')).toBe('failed');
      expect(normalizeJobStatus('cancelled')).toBe('cancelled');
      expect(normalizeJobStatus('canceled')).toBe('cancelled');
    });

    it('handles uppercase and whitespace', () => {
      expect(normalizeJobStatus(' PROCESSING ')).toBe('running');
      expect(normalizeJobStatus('COMPLETED')).toBe('succeeded');
    });

    it('falls back to failed for unknown status strings', () => {
      expect(normalizeJobStatus('unknown_status')).toBe('failed');
    });
  });

  describe('isTerminalState', () => {
    it('identifies terminal states correctly', () => {
      expect(isTerminalState('succeeded')).toBe(true);
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('cancelled')).toBe(true);

      expect(isTerminalState('queued')).toBe(false);
      expect(isTerminalState('running')).toBe(false);
      expect(isTerminalState('ready')).toBe(false);
    });
  });

  describe('isValidStateTransition', () => {
    it('permits valid transitions', () => {
      expect(isValidStateTransition('ready', 'queued')).toBe(true);
      expect(isValidStateTransition('queued', 'running')).toBe(true);
      expect(isValidStateTransition('queued', 'cancelled')).toBe(true);
      expect(isValidStateTransition('running', 'succeeded')).toBe(true);
      expect(isValidStateTransition('running', 'failed')).toBe(true);
      expect(isValidStateTransition('running', 'cancelled')).toBe(true);
      expect(isValidStateTransition('running', 'running')).toBe(true);
    });

    it('rejects transitions from terminal states', () => {
      const terminalStates: JobState[] = ['succeeded', 'failed', 'cancelled'];
      const activeStates: JobState[] = ['ready', 'queued', 'running'];

      for (const term of terminalStates) {
        for (const act of activeStates) {
          expect(isValidStateTransition(term, act)).toBe(false);
        }
      }
    });
  });
});

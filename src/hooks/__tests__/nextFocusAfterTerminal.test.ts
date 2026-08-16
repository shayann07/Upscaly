import { describe, it, expect } from 'vitest';
import { nextFocusAfterTerminal } from '../useJobSync';
import { QueueItem } from '../../store/queueItem';

function item(id: string, status: QueueItem['status']): QueueItem {
  return { id, status } as QueueItem;
}

describe('nextFocusAfterTerminal', () => {
  it('moves off a finished item onto one still working', () => {
    // The batch case: image 1 finishes and the studio used to swap to its
    // completion card while 2 and 3 upscaled invisibly behind it.
    const items = [item('a', 'succeeded'), item('b', 'running'), item('c', 'queued')];
    expect(nextFocusAfterTerminal(items, 'a')).toBe('b');
  });

  it('leaves a live selection alone', () => {
    // The user watching image 2 work must not be yanked elsewhere because
    // image 1 happened to finish.
    const items = [item('a', 'succeeded'), item('b', 'running')];
    expect(nextFocusAfterTerminal(items, 'b')).toBeNull();
  });

  it('stays put when the whole run is over', () => {
    // Nothing left to follow: the completion card is now the right thing
    // to be looking at.
    const items = [item('a', 'succeeded'), item('b', 'succeeded')];
    expect(nextFocusAfterTerminal(items, 'a')).toBeNull();
  });

  it('follows work past a failure too', () => {
    const items = [item('a', 'failed'), item('b', 'running')];
    expect(nextFocusAfterTerminal(items, 'a')).toBe('b');
  });

  it('does nothing when the selection is not in the queue', () => {
    expect(nextFocusAfterTerminal([item('b', 'running')], 'gone')).toBeNull();
    expect(nextFocusAfterTerminal([item('b', 'running')], null)).toBeNull();
  });
});

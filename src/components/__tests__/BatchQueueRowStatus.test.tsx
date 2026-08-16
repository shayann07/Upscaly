import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatchQueueView } from '../BatchQueueView';
import { QueueItem } from '../../store/queueItem';

function item(overrides: Partial<QueueItem>): QueueItem {
  return {
    id: 'a',
    filePath: 'C:/in/clip.mp4',
    fileName: 'clip.mp4',
    isVideo: true,
    status: 'ready',
    progress: 0,
    phase: null,
    error: null,
    outputPath: null,
    modelName: null,
    scale: null,
    etaSeconds: null,
    fps: null,
    startedAtMs: null,
    w: null,
    h: null,
    ...overrides,
  } as QueueItem;
}

describe('queue row failure marker', () => {
  it('marks a failed row permanently, with the reason as its tooltip', () => {
    // The regression this guards: a failure was reported only by a toast
    // that removed itself after five seconds, and the row rendered an empty
    // status glyph -- indistinguishable from one that had never run. A
    // 50-minute video job that failed while the user was away therefore
    // left no trace anywhere in the UI.
    render(
      <BatchQueueView
        items={[item({ status: 'failed', error: 'Cannot write to the output folder' })]}
        selectedId="a"
      />
    );

    expect(screen.getByText('!')).toBeInTheDocument();
    expect(screen.getByTitle('Cannot write to the output folder')).toBeInTheDocument();
  });

  it('does not mark rows that simply have not run', () => {
    render(<BatchQueueView items={[item({ status: 'ready' })]} selectedId="a" />);
    expect(screen.queryByText('!')).not.toBeInTheDocument();
  });

  it('still shows the tick for a success', () => {
    render(<BatchQueueView items={[item({ status: 'succeeded' })]} selectedId="a" />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.queryByText('!')).not.toBeInTheDocument();
  });
});

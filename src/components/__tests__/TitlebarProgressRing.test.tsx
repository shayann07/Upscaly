import { render, screen } from '@testing-library/react';
import { TitlebarProgressRing } from '../titlebar/TitlebarProgressRing';
import { describe, it, expect, beforeEach } from 'vitest';
import { resetStudioStore, studioActions } from '../../store/studioStore';
import { StagedFile } from '../../store/queueItem';

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

describe('TitlebarProgressRing', () => {
  beforeEach(() => {
    resetStudioStore();
  });

  it('renders nothing when idle and no items in queue', () => {
    const { container } = render(<TitlebarProgressRing />);
    expect(container.firstChild).toBeNull();
  });

  it('renders progress text when batch items are processing', () => {
    studioActions.addFiles([staged('item1'), staged('item2'), staged('item3')], false);
    studioActions.updateItem('item1', { status: 'succeeded' });
    studioActions.updateItem('item2', { status: 'running', progress: 50 });

    render(<TitlebarProgressRing />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });
});

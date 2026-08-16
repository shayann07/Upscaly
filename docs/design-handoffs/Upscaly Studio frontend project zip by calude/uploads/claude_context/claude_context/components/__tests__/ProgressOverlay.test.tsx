import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProgressOverlay } from '../ProgressOverlay';

describe('ProgressOverlay Component', () => {
  it('renders percentage and status text', () => {
    render(
      <ProgressOverlay
        percentage={68.4}
        statusText="Upscaling frames (684 / 1000)..."
        phase="Upscaling Video Frames"
        fps={24}
        etaSeconds={14}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('68.4%')).toBeInTheDocument();
    expect(screen.getByText('Upscaling Video Frames')).toBeInTheDocument();
    expect(screen.getByText('~14s left')).toBeInTheDocument();
    expect(screen.getByText('24 FPS')).toBeInTheDocument();
  });

  it('triggers cancel callback when Cancel Upscale is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <ProgressOverlay
        percentage={20}
        statusText="Processing"
        phase="Processing"
        onCancel={handleCancel}
      />
    );
    const cancelBtn = screen.getByText('Cancel Upscale');
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});

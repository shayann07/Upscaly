import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CompletionCard } from '../CompletionCard';
import * as core from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(1024),
}));

describe('CompletionCard', () => {
  beforeEach(() => {
    vi.mocked(core.invoke).mockResolvedValue(1024);
  });
  it('renders output filename and fetches real filesystem size', async () => {
    vi.mocked(core.invoke).mockResolvedValueOnce(5_242_880); // 5 MB

    render(
      <CompletionCard
        outputPath="C:/path/to/my_image_upscaled_4x.png"
        outputDims={{ w: 3840, h: 2160 }}
      />
    );

    expect(screen.getByText('my_image_upscaled_4x.png')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    });
  });

  it('formats KB and GB appropriately', async () => {
    vi.mocked(core.invoke).mockResolvedValueOnce(512_000); // 500 KB

    render(
      <CompletionCard outputPath="C:/path/to/small_file.png" outputDims={{ w: 1000, h: 1000 }} />
    );

    await waitFor(() => {
      expect(screen.getByText('500.0 KB')).toBeInTheDocument();
    });
  });

  it('triggers action buttons', () => {
    const onOpen = vi.fn();
    const onSetSplit = vi.fn();
    const onSetSide = vi.fn();
    const onCycleZoom = vi.fn();

    render(
      <CompletionCard
        outputPath="C:/path/to/image.png"
        onOpen={onOpen}
        onSetSplit={onSetSplit}
        onSetSide={onSetSide}
        onCycleZoom={onCycleZoom}
      />
    );

    fireEvent.click(screen.getByText('Open'));
    expect(onOpen).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Side'));
    expect(onSetSide).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Split'));
    expect(onSetSplit).toHaveBeenCalled();

    fireEvent.click(screen.getByText('1×'));
    expect(onCycleZoom).toHaveBeenCalled();
  });
});

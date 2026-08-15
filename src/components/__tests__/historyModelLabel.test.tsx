import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentHistoryDrawer } from '../RecentHistoryDrawer';
import { HistoryEntry, ModelInfo } from '../../lib/types';

const CATALOG = [
  { id: 'realesrgan-x4plus', name: 'RealESRGAN Ultra' },
  { id: 'realesr-animevideov3-x2', name: 'Anime Video 2x' },
] as ModelInfo[];

function renderWith(entry: Partial<HistoryEntry>) {
  render(
    <RecentHistoryDrawer
      history={[{ id: 'h1', fileName: 'clip.mp4', scale: 4, ...entry } as HistoryEntry]}
      supportedModels={CATALOG}
      onClose={vi.fn()}
    />
  );
}

describe('history model labels', () => {
  it('resolves a stored model id through the live catalog', () => {
    renderWith({ modelId: 'realesrgan-x4plus' });
    expect(screen.getByText(/REALESRGAN ULTRA · 4×/i)).toBeInTheDocument();
  });

  it('prefers the catalog name over a stale name stored on the entry', () => {
    // The catalog is the source of truth: a model renamed since the job ran
    // should read by its current name.
    renderWith({ modelId: 'realesr-animevideov3-x2', modelName: 'Old Anime Name' });
    expect(screen.getByText(/ANIME VIDEO 2X · 4×/i)).toBeInTheDocument();
  });

  it('falls back to the stored name for entries written before ids existed', () => {
    renderWith({ modelName: 'Legacy Model' });
    expect(screen.getByText(/LEGACY MODEL · 4×/i)).toBeInTheDocument();
  });

  it('falls back to the raw id when the model is no longer installed', () => {
    renderWith({ modelId: 'some-removed-model' });
    expect(screen.getByText(/SOME-REMOVED-MODEL · 4×/i)).toBeInTheDocument();
  });
});

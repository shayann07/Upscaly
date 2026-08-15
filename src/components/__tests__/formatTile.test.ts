import { describe, it, expect } from 'vitest';
import { formatTile } from '../studio/StudioControlsSection';

describe('formatTile', () => {
  it('reports the clamped tile, not the one that was asked for', () => {
    // The regression: selecting 512 at 4x on a 6GB card runs at 384, and
    // the progress overlay printed "TILE 512px" for the whole run --
    // describing a configuration that was never executed, while the
    // settings panel two inches away said it had been clamped.
    expect(formatTile(512, 384)).toBe('384px (512 capped)');
  });

  it('says just the size when the request was honoured', () => {
    expect(formatTile(256, 256)).toBe('256px');
  });

  it('renders AUTO for the delegated tile whichever side reports it', () => {
    expect(formatTile(0, 0)).toBe('AUTO');
    // AUTO was requested, so there is no request to contrast against even
    // if the backend names a concrete size.
    expect(formatTile(0, 384)).toBe('384px');
  });

  it('falls back to the request while the backend has not answered', () => {
    // Null means "no profile yet", not "no clamp" -- showing the request is
    // the only honest option, and it must not claim a clamp it cannot know.
    expect(formatTile(512, null)).toBe('512px');
    expect(formatTile(0, null)).toBe('AUTO');
  });
});

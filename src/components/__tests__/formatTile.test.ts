import { describe, it, expect } from 'vitest';
import { formatRate, formatTile } from '../studio/StudioControlsSection';

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

describe('formatRate', () => {
  it('reports seconds-per-frame below 1 FPS instead of rounding to zero', () => {
    // A TTA video run sits near 0.01 fps. One-decimal FPS formatting turns
    // that into "0.0 FPS", which reads as a stalled job rather than a slow
    // one -- the exact confusion this replaces.
    expect(formatRate(0.0125, null, null, null, 50, null)).toBe('80 s/frame');
    expect(formatRate(0.5, null, null, null, 50, null)).toBe('2 s/frame');
  });

  it('keeps FPS for rates where FPS is the natural unit', () => {
    expect(formatRate(12.34, null, null, null, 50, null)).toBe('12.3 FPS');
    expect(formatRate(1, null, null, null, 50, null)).toBe('1.0 FPS');
  });

  it('says nothing when there is no measured rate', () => {
    expect(formatRate(null, null, null, null, 0, null)).toBe('');
  });
});

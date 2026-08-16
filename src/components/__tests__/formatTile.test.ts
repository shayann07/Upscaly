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
  /** Only `fps` and `progress` matter to the video path; the rest are the
   * image-rate inputs, absent for video. */
  const atFps = (fps: number | null) => ({
    fps,
    w: null,
    h: null,
    scale: null,
    progress: 50,
    startedAtMs: null,
  });

  it('reports seconds-per-frame below 1 FPS instead of rounding to zero', () => {
    // A TTA video run sits near 0.01 fps. One-decimal FPS formatting turns
    // that into "0.0 FPS", which reads as a stalled job rather than a slow
    // one -- the exact confusion this replaces.
    expect(formatRate(atFps(0.0125))).toBe('80 s/frame');
    expect(formatRate(atFps(0.5))).toBe('2 s/frame');
  });

  it('keeps FPS for rates where FPS is the natural unit', () => {
    expect(formatRate(atFps(12.34))).toBe('12.3 FPS');
    expect(formatRate(atFps(1))).toBe('1.0 FPS');
  });

  it('says nothing when there is no measured rate', () => {
    expect(formatRate({ ...atFps(null), progress: 0 })).toBe('');
  });

  it('reports a megapixel rate for images once dimensions are known', () => {
    // The image path: no fps from the backend, so the rate is derived from
    // probed dimensions and elapsed time.
    const rate = formatRate({
      fps: null,
      w: 1000,
      h: 1000,
      scale: 2,
      progress: 50,
      startedAtMs: Date.now() - 1000,
    });
    expect(rate).toMatch(/MP\/s$/);
  });

  it('refuses to guess a megapixel rate when dimensions were never probed', () => {
    // Never derive a figure from assumed 1920x1080 -- an unmeasured value
    // is reported as nothing at all.
    expect(
      formatRate({
        fps: null,
        w: null,
        h: null,
        scale: 2,
        progress: 50,
        startedAtMs: Date.now() - 1000,
      })
    ).toBe('');
  });
});

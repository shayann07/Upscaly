import { describe, it, expect } from 'vitest';
import { resolveGpu, preferredGpu } from '../gpuSelection';
import { GpuInfo } from '../types';

const NVIDIA = 'NVIDIA GeForce RTX 3050 6GB Laptop GPU';
const INTEL = 'Intel(R) UHD Graphics';

/** The enumeration as it came back on one launch. */
function enumeration(...names: string[]): GpuInfo[] {
  return names.map((name, id) => ({ id, name, detail: '', vram_mb: 0 }) as GpuInfo);
}

describe('resolveGpu', () => {
  it('follows the saved name across a reordered enumeration', () => {
    // The actual bug. Both of these were observed on the same machine
    // minutes apart, and the index alone points at different silicon in
    // each -- so the saved choice has to be matched by name.
    const firstLaunch = enumeration(NVIDIA, INTEL);
    const secondLaunch = enumeration(INTEL, NVIDIA);

    expect(resolveGpu(firstLaunch, NVIDIA).gpu?.id).toBe(0);
    expect(resolveGpu(secondLaunch, NVIDIA).gpu?.id).toBe(1);
    // Same card both times, which is the whole point.
    expect(resolveGpu(firstLaunch, NVIDIA).gpu?.name).toBe(NVIDIA);
    expect(resolveGpu(secondLaunch, NVIDIA).gpu?.name).toBe(NVIDIA);
  });

  it('honours a saved iGPU choice rather than overriding it with the discrete card', () => {
    const gpus = enumeration(NVIDIA, INTEL);
    const { gpu, reason } = resolveGpu(gpus, INTEL);
    expect(gpu?.name).toBe(INTEL);
    expect(reason).toBe('saved-name');
  });

  it('reports when the saved card is gone instead of substituting silently', () => {
    const gpus = enumeration(INTEL);
    const { gpu, reason } = resolveGpu(gpus, NVIDIA);
    expect(gpu?.name).toBe(INTEL);
    // The caller raises a toast on this: swapping the device changes both
    // speed and output pixels, so it cannot happen unannounced.
    expect(reason).toBe('saved-name-missing');
  });

  it('prefers the discrete card when nothing is saved', () => {
    const { gpu, reason } = resolveGpu(enumeration(INTEL, NVIDIA), null);
    expect(gpu?.name).toBe(NVIDIA);
    expect(reason).toBe('no-saved-name');
  });

  it('handles an empty enumeration without inventing a device', () => {
    const { gpu, reason } = resolveGpu([], NVIDIA);
    expect(gpu).toBeUndefined();
    expect(reason).toBe('none-available');
  });
});

describe('preferredGpu', () => {
  it('falls back to the first device when none look discrete', () => {
    expect(preferredGpu(enumeration(INTEL, 'Some CPU Fallback'))?.name).toBe(INTEL);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getThumbnail } from '../thumbnailCache';

vi.mock('../assetScope', () => ({
  allowMediaPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../media', () => ({
  getMediaSrc: vi.fn((path: string) => (path ? `asset://localhost/${encodeURIComponent(path)}` : '')),
}));

describe('thumbnailCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for empty or null file paths', async () => {
    expect(await getThumbnail('')).toBeNull();
    expect(await getThumbnail(undefined)).toBeNull();
    expect(await getThumbnail(null)).toBeNull();
  });

  it('deduplicates concurrent requests for the same path', async () => {
    const p1 = getThumbnail('C:/test/image.png', false);
    const p2 = getThumbnail('C:/test/image.png', false);
    expect(p1).toBe(p2);
  });
});

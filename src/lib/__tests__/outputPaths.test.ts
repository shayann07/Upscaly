import { describe, it, expect, beforeEach } from 'vitest';
import { buildDefaultOutputPath, JobOutputPathRegistry } from '../outputPaths';

describe('outputPaths module', () => {
  describe('buildDefaultOutputPath', () => {
    it('appends scale suffix to image path correctly', () => {
      expect(buildDefaultOutputPath('C:/images/photo.png', 4)).toBe('C:/images/photo_4x.png');
      expect(buildDefaultOutputPath('C:/images/anime.jpg', 2)).toBe('C:/images/anime_2x.jpg');
      expect(buildDefaultOutputPath('C:/images/render.webp', 3)).toBe('C:/images/render_3x.webp');
    });

    it('handles Windows backslash separators', () => {
      expect(buildDefaultOutputPath('C:\\Users\\user\\photo.png', 4)).toBe(
        'C:/Users/user/photo_4x.png'
      );
    });

    it('supports custom output directory overrides', () => {
      expect(buildDefaultOutputPath('C:/input/photo.png', 4, 'D:/output')).toBe(
        'D:/output/photo_4x.png'
      );
    });

    it('handles empty input path safely', () => {
      expect(buildDefaultOutputPath('', 4)).toBe('');
    });
  });

  describe('JobOutputPathRegistry', () => {
    let registry: JobOutputPathRegistry;

    beforeEach(() => {
      registry = new JobOutputPathRegistry();
    });

    it('stores and retrieves per-job output paths accurately', () => {
      registry.setOutputPath('job-1', 'C:/out/photo_4x.png');
      registry.setOutputPath('job-2', 'C:/out/video_2x.mp4');

      expect(registry.getOutputPath('job-1')).toBe('C:/out/photo_4x.png');
      expect(registry.getOutputPath('job-2')).toBe('C:/out/video_2x.mp4');
      expect(registry.hasOutputPath('job-1')).toBe(true);
      expect(registry.hasOutputPath('job-3')).toBe(false);
    });

    it('allows overwriting path for a job ID', () => {
      registry.setOutputPath('job-1', 'C:/out/photo_4x.png');
      registry.setOutputPath('job-1', 'C:/out/photo_4x_1.png');

      expect(registry.getOutputPath('job-1')).toBe('C:/out/photo_4x_1.png');
    });

    it('clears specific job and all jobs cleanly', () => {
      registry.setOutputPath('job-1', 'C:/out/photo_4x.png');
      registry.setOutputPath('job-2', 'C:/out/video_2x.mp4');

      registry.clearJob('job-1');
      expect(registry.hasOutputPath('job-1')).toBe(false);
      expect(registry.hasOutputPath('job-2')).toBe(true);

      registry.clearAll();
      expect(registry.hasOutputPath('job-2')).toBe(false);
    });
  });
});

export function buildDefaultOutputPath(
  inputPath: string,
  scale: number = 4,
  customOutputDir?: string
): string {
  if (!inputPath) return '';

  const cleanPath = inputPath.replace(/\\/g, '/');
  const lastSlashIndex = cleanPath.lastIndexOf('/');
  const dir = lastSlashIndex >= 0 ? cleanPath.substring(0, lastSlashIndex) : '';
  const fileWithExt = lastSlashIndex >= 0 ? cleanPath.substring(lastSlashIndex + 1) : cleanPath;

  const dotIndex = fileWithExt.lastIndexOf('.');
  let fileName = fileWithExt;
  let ext = '';

  if (dotIndex > 0) {
    fileName = fileWithExt.substring(0, dotIndex);
    ext = fileWithExt.substring(dotIndex);
  }

  const outputDirName = customOutputDir ? customOutputDir.replace(/\\/g, '/') : dir;
  const newFileName = `${fileName}_${scale}x${ext}`;

  if (!outputDirName) {
    return newFileName;
  }

  return `${outputDirName}/${newFileName}`;
}

export class JobOutputPathRegistry {
  private pathMap: Map<string, string> = new Map();

  setOutputPath(jobId: string, path: string): void {
    if (jobId && path) {
      this.pathMap.set(jobId, path);
    }
  }

  getOutputPath(jobId: string): string | undefined {
    return this.pathMap.get(jobId);
  }

  hasOutputPath(jobId: string): boolean {
    return this.pathMap.has(jobId);
  }

  clearJob(jobId: string): void {
    this.pathMap.delete(jobId);
  }

  clearAll(): void {
    this.pathMap.clear();
  }
}

export function joinPath(dir: string, filename: string): string {
  const cleanDir = dir.replace(/[/\\]+$/, '');
  return `${cleanDir}\\${filename}`;
}

export function resolveUpscaleOutputPath(
  filePath: string,
  fileName: string,
  isVideo: boolean,
  scale: number,
  customOutputPath: string
): string {
  const ext = isVideo ? '.mp4' : '.png';
  const baseName = (fileName || 'media').replace(/\.[^/.]+$/, '');
  const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;

  if (customOutputPath) {
    return joinPath(customOutputPath, outputFilename);
  }
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const parentDir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
  return joinPath(parentDir, outputFilename);
}

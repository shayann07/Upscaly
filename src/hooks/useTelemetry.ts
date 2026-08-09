import { GpuInfo } from '../lib/types';

interface TelemetryOptions {
  gpus: GpuInfo[];
  selectedGpu: number;
  jobStatus: string;
  tileSize: number;
}

export function useTelemetry({ gpus, selectedGpu, jobStatus, tileSize }: TelemetryOptions) {
  const currentGpuInfo = gpus.find((g) => g.id === selectedGpu) || gpus[0];

  const totalGpuVramGb = (() => {
    if (!currentGpuInfo) return 8;
    const match =
      currentGpuInfo.name.match(/(\d+)\s*GB/i) ||
      (currentGpuInfo.detail && currentGpuInfo.detail.match(/(\d+)\s*GB/i));
    if (match && match[1]) return parseInt(match[1], 10);
    if (currentGpuInfo.name.toLowerCase().includes('intel')) return 2;
    return 8;
  })();

  const activeVramGb = (() => {
    if (selectedGpu === -1) return 'SYSTEM RAM';
    const isProc = jobStatus === 'processing' || jobStatus === 'queued';
    if (isProc) {
      const tileMult = tileSize === 512 ? 0.75 : tileSize === 256 ? 0.45 : 0.25;
      const used = Math.min(totalGpuVramGb, Math.round(totalGpuVramGb * tileMult * 10) / 10);
      return `${used.toFixed(1)} GB`;
    }
    const idle = Math.round(totalGpuVramGb * 0.22 * 10) / 10;
    return `${idle.toFixed(1)} GB`;
  })();

  const isVramOverflowing =
    activeVramGb !== 'SYSTEM RAM' && parseFloat(activeVramGb) > totalGpuVramGb;

  return { activeVramGb, isVramOverflowing };
}

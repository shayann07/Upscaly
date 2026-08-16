import { useGpuTelemetry } from '../../hooks/useGpuTelemetry';
import { GpuTelemetryReadout } from './GpuTelemetryReadout';

interface TitlebarFileChipProps {
  fileName: string;
  kindTag: string;
  outDims: string;
  isDone: boolean;
  isProcessing?: boolean;
  onRemoveFile: () => void;
}

export function TitlebarFileChip({
  fileName,
  kindTag,
  outDims,
  isDone,
  isProcessing,
  onRemoveFile,
}: TitlebarFileChipProps) {
  // Polled here, not in the GPU island: the titlebar shows either the island
  // or this chip, and a running job always has a file loaded -- so the chip
  // is the only titlebar component actually mounted while there is a
  // temperature worth reporting. The first version put the readout in the
  // island, which is unmounted at exactly that moment.
  const telemetry = useGpuTelemetry(isProcessing === true);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
      <div className="flex items-center gap-[11px] h-[34px] pl-3 pr-1.5 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]">
        {isProcessing && (
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse flex-none" />
        )}
        <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 max-w-[230px]">
          {fileName}
        </span>
        <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.05em] whitespace-nowrap">
          {kindTag}
        </span>
        {telemetry && <GpuTelemetryReadout telemetry={telemetry} />}
        {isDone && outDims && (
          <span className="inline-block px-[7px] py-[3px] rounded-[6px] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] font-semibold whitespace-nowrap bg-[var(--accent-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
            {outDims}
          </span>
        )}
        <button
          onClick={onRemoveFile}
          title={isProcessing ? 'Cancel active upscale and remove' : 'Remove from queue'}
          className="w-6 h-6 flex-none flex items-center justify-center border border-[var(--border-danger)] rounded-lg bg-[var(--danger-bg)] text-[var(--danger-text)] text-sm leading-none cursor-pointer transition-all duration-150 hover:bg-[var(--danger-hover)] hover:text-[#F2C4BE]"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default TitlebarFileChip;

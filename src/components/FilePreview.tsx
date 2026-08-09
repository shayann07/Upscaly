import React from 'react';
import {
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowRight,
  Sparkle,
} from '@phosphor-icons/react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface FilePreviewProps {
  filePath: string;
  fileName?: string;
  fileSize?: number;
  isVideo?: boolean;
  scale?: number;
  onRemove?: () => void;
  isProcessing?: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  filePath,
  fileName,
  fileSize = 0,
  isVideo = false,
  scale = 4,
  onRemove,
  isProcessing = false,
}) => {
  const name = fileName || filePath.split(/[\\/]/).pop() || '';
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const checkIsVideo = isVideo || ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return 'Local File';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const src = filePath ? convertFileSrc(filePath) : '';

  // If used inside unified stage with filename/scale info:
  if (fileName || onRemove) {
    return (
      <div className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-2.5 flex items-center justify-between select-none shadow-lg shrink-0">
        {/* Left: Media Icon & Filename */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent)] shrink-0">
            {checkIsVideo ? <VideoIcon size={18} /> : <ImageIcon size={18} />}
          </div>
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{name}</p>
            <p className="text-[10px] text-[var(--text-dim)] font-mono font-medium uppercase">
              {formatSize(fileSize)} &bull; {checkIsVideo ? 'Video' : 'Image'}
            </p>
          </div>
        </div>

        {/* Center: Target Scale Badge */}
        <div className="flex items-center gap-1.5 font-mono font-medium text-xs text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] px-3 py-1 rounded-lg">
          <span className="text-[var(--text-dim)] text-[10px]">Source</span>
          <ArrowRight size={12} className="text-[var(--text-dim)]" />
          <span className="px-2 py-0.5 rounded bg-[var(--accent-bg)] text-[var(--accent)] text-[10px] border border-[var(--border-subtle)] flex items-center gap-1">
            <Sparkle size={10} weight="fill" className="text-[var(--accent)]" />
            {scale}x AI Enhanced
          </span>
        </div>

        {/* Right: Quick Remove Button */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-4 p-1.5 rounded-lg bg-[var(--danger-bg)] text-[var(--danger-text)] hover:bg-[var(--danger-hover)] border border-[var(--border-danger)] transition-colors shrink-0 cursor-pointer"
            title="Remove File"
          >
            <X size={14} weight="bold" />
          </button>
        )}
      </div>
    );
  }

  // Full-bleed preview background mode:
  return (
    <div className="absolute inset-0 overflow-hidden">
      {checkIsVideo ? (
        <video
          src={src}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            filter: isProcessing ? 'saturate(.7) brightness(.86)' : 'none',
            transition: 'filter .3s ease',
          }}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: isProcessing ? 'saturate(.7) brightness(.86)' : 'none',
            transition: 'filter .3s ease',
          }}
        />
      )}
    </div>
  );
};

export default FilePreview;

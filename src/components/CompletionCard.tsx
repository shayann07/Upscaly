import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

interface CompletionCardProps {
  outputPath: string;
  outputDims?: { w: number; h: number };
  compareMode?: 'split' | 'side';
  zoom?: number;
  onSetSplit?: () => void;
  onSetSide?: () => void;
  onCycleZoom?: () => void;
  onOpen?: () => void;
  onReset?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function CompletionCardImpl({
  outputPath,
  outputDims = { w: 3840, h: 2160 },
  compareMode = 'split',
  zoom = 1,
  onSetSplit = () => {},
  onSetSide = () => {},
  onCycleZoom = () => {},
  onOpen,
  onReset,
}: CompletionCardProps) {
  const fileName = outputPath.split(/[\\/]/).pop() || '';
  const [realSizeStr, setRealSizeStr] = useState<string | null>(null);

  useEffect(() => {
    if (!outputPath) return;
    invoke<number>('get_file_size_bytes', { path: outputPath })
      .then((bytes) => {
        if (typeof bytes === 'number' && bytes > 0) {
          setRealSizeStr(formatBytes(bytes));
        }
      })
      .catch(() => {});
  }, [outputPath]);

  const fallbackSize = `${((outputDims.w * outputDims.h * 3) / 1048576).toFixed(1)} MB`;
  const handleOpen = onOpen || onReset || (() => {});

  const segStyle = (active: boolean) => ({
    height: '26px',
    padding: '0 11px',
    border: 'none',
    borderRadius: '7px',
    background: active ? '#2A2725' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontFamily: 'Archivo, sans-serif',
    fontSize: '11.5px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    transition: 'all .16s',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 14, x: '-50%' }}
      transition={{ duration: 0.32, ease: [0.22, 1.3, 0.36, 1] }}
      className="absolute bottom-[78px] left-1/2 flex items-center gap-3.5 z-[35] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        background: 'rgba(11,10,9,.95)',
        boxShadow: '0 18px 44px rgba(0,0,0,.65)',
      }}
    >
      {/* Check icon */}
      <div className="w-6 h-6 flex-none border border-[var(--success-border)] rounded-lg bg-[var(--success-bg)] flex items-center justify-center text-[var(--success)] text-xs">
        ✓
      </div>

      {/* Output info */}
      <div className="font-['Martian_Mono',monospace] text-[10px] text-[var(--text-secondary)] whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis">
        {fileName}
      </div>
      <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.05em] whitespace-nowrap">
        {realSizeStr || fallbackSize}
      </span>

      <div className="w-px h-5 bg-[var(--border-default)]" />

      {/* Compare mode toggles */}
      <div className="flex items-center gap-0.5">
        <button onClick={onSetSplit} style={segStyle(compareMode === 'split')}>
          Split
        </button>
        <button onClick={onSetSide} style={segStyle(compareMode === 'side')}>
          Side
        </button>
        <button
          onClick={onCycleZoom}
          className="h-[26px] px-2.5 border-none rounded-[7px] bg-transparent text-[var(--text-secondary)] font-['Martian_Mono',monospace] text-[10px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {zoom}×
        </button>
      </div>

      {/* Open button */}
      <button
        onClick={handleOpen}
        className="h-[26px] px-3 border-none rounded-lg bg-[var(--text-primary)] text-[var(--bg-base)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
        style={{ transition: 'transform .18s var(--ease-pop)' }}
      >
        Open
      </button>
    </motion.div>
  );
}

export const CompletionCard = memo(CompletionCardImpl);

export default CompletionCard;

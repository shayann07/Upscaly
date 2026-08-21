interface BatchQueueRowControlsProps {
  open: boolean;
  fileId: string;
  status: string;
  col: string;
  statusLabel: string;
  error?: string | null;
  onRemoveItem?: ((id: string) => void) | undefined;
  onCancelItem?: ((id: string) => void) | undefined;
  onRetryItem?: ((id: string) => void) | undefined;
}

export function BatchQueueRowControls({
  open,
  fileId,
  status,
  col,
  statusLabel,
  error,
  onRemoveItem,
  onCancelItem,
  onRetryItem,
}: BatchQueueRowControlsProps) {
  const handleCopyError = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (error) {
      void navigator.clipboard.writeText(error);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetryItem?.(fileId);
  };

  return (
    <>
      {status === 'failed' && onRetryItem && open && (
        <button
          onClick={handleRetry}
          title="Retry upscaling"
          className="w-5 h-5 flex items-center justify-center rounded border border-[var(--border-danger)] bg-[var(--danger-bg)] text-[var(--danger-text)] text-[11px] transition-all duration-150 hover:scale-110 hover:bg-[var(--danger-hover)]"
        >
          ↺
        </button>
      )}

      {status === 'failed' && error && open && (
        <button
          onClick={handleCopyError}
          title="Copy error details"
          className="w-5 h-5 hidden group-hover:flex items-center justify-center rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] text-[9px] font-['Martian_Mono',monospace] transition-all duration-150 hover:scale-110 hover:text-[var(--text-primary)]"
        >
          📋
        </button>
      )}

      {onRemoveItem && open && status !== 'running' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveItem(fileId);
          }}
          title="Remove from queue"
          className="w-5 h-5 hidden group-hover:flex items-center justify-center border-none bg-transparent text-[var(--text-muted)] transition-all duration-150 hover:text-[var(--danger-text)] hover:scale-110 cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <div
        className="flex-none font-['Martian_Mono',monospace] text-[9px]"
        style={{ display: open ? 'block' : 'none', color: col }}
      >
        {statusLabel}
      </div>

      {onCancelItem && status === 'running' && open && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancelItem(fileId);
          }}
          title="Cancel upscaling"
          className="w-5 h-5 flex items-center justify-center border-none bg-transparent text-[var(--danger-text)] ml-1 transition-all duration-150 hover:text-[#EF4444] hover:scale-110 cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </>
  );
}

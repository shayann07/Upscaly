interface BatchQueueRowControlsProps {
  open: boolean;
  fileId: string;
  status: string;
  col: string;
  statusLabel: string;
  onRemoveItem?: ((id: string) => void) | undefined;
  onCancelItem?: ((id: string) => void) | undefined;
}

export function BatchQueueRowControls({
  open,
  fileId,
  status,
  col,
  statusLabel,
  onRemoveItem,
  onCancelItem,
}: BatchQueueRowControlsProps) {
  return (
    <>
      {onRemoveItem && open && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveItem(fileId);
          }}
          className="w-4 h-4 hidden group-hover:flex items-center justify-center rounded text-[var(--danger-text)] text-xs transition-all duration-150 hover:scale-110"
        >
          ×
        </button>
      )}

      <div
        className="flex-none font-['Martian_Mono',monospace] text-[9px]"
        style={{ display: open ? 'block' : 'none', color: col }}
      >
        {statusLabel}
      </div>

      {onCancelItem && status === 'processing' && (
        <button
          onClick={() => onCancelItem(fileId)}
          className="text-[9px] text-[var(--danger-text)] ml-1 transition-all duration-150 hover:scale-110"
        >
          ✕
        </button>
      )}
    </>
  );
}

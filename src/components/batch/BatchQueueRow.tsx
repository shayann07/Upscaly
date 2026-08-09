import { BatchItem } from '../../lib/types';
import { BatchQueueRowThumbnail } from './BatchQueueRowThumbnail';
import { BatchQueueRowControls } from './BatchQueueRowControls';

interface BatchQueueRowProps {
  file: BatchItem;
  index: number;
  open: boolean;
  active: boolean;
  accentColor: string;
  EASE: string;
  onSelect: (id: string) => void;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragEnter: (idx: number) => void;
  onDragEnd: () => void;
  onRemoveItem?: ((id: string) => void) | undefined;
  onCancelItem?: ((id: string) => void) | undefined;
}

function getItemColor(status: string, accentColor: string): string {
  if (status === 'done' || status === 'completed') return 'var(--success)';
  if (status === 'processing') return accentColor;
  if (status === 'queued') return 'var(--text-secondary)';
  return 'var(--text-dim)';
}

function getItemStatusLabel(status: string, progress: number): string {
  if (status === 'done' || status === 'completed') return '✓';
  if (status === 'processing') return `${Math.round(progress)}%`;
  if (status === 'queued') return '···';
  return '';
}

function getRowStyle(open: boolean, active: boolean, index: number): React.CSSProperties {
  return {
    gap: open ? 11 : 0,
    justifyContent: open ? 'flex-start' : 'center',
    padding: open ? '6px' : '0',
    marginBottom: open ? 3 : -13,
    borderRadius: open ? 10 : 12,
    border: `1px solid ${open && active ? 'var(--border-subtle)' : 'transparent'}`,
    background: open && active ? 'var(--bg-active)' : 'transparent',
    overflow: open ? 'hidden' : 'visible',
    zIndex: active ? 40 : 20 - index,
    opacity: open || active ? 1 : 0.66,
    transform: open ? 'none' : `translateX(${active ? 5 : 0}px) scale(${active ? 1 : 0.9})`,
    transformOrigin: 'center left',
  };
}

export function BatchQueueRow({
  file,
  index,
  open,
  active,
  accentColor,
  EASE,
  onSelect,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onRemoveItem,
  onCancelItem,
}: BatchQueueRowProps) {
  const st = file.status;
  const col = getItemColor(st, accentColor);
  const statusLabel = getItemStatusLabel(st, file.progress);

  return (
    <div
      onClick={() => onSelect(file.id)}
      draggable
      onDragStart={(e) => onDragStart(index, e)}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      className="relative flex items-center cursor-pointer group transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={getRowStyle(open, active, index)}
    >
      <BatchQueueRowThumbnail
        file={file}
        open={open}
        active={active}
        accentColor={accentColor}
        EASE={EASE}
        col={col}
      />

      <div className="flex-1 min-w-0" style={{ display: open ? 'block' : 'none' }}>
        <div className="text-[11.5px] font-medium text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
          {file.name}
        </div>
        {file.w && file.h ? (
          <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-muted)] tracking-[0.03em] whitespace-nowrap overflow-hidden text-ellipsis">
            {file.w}×{file.h}
          </div>
        ) : null}
      </div>

      <BatchQueueRowControls
        open={open}
        fileId={file.id}
        status={st}
        col={col}
        statusLabel={statusLabel}
        onRemoveItem={onRemoveItem}
        onCancelItem={onCancelItem}
      />

      <div
        className="absolute left-0 bottom-0 h-0.5"
        style={{
          width: `${st === 'processing' ? file.progress : 0}%`,
          background: accentColor,
          transition: 'width .2s linear',
        }}
      />
    </div>
  );
}

import { BatchItem } from '../../lib/types';
import { getMediaSrc } from '../../lib/media';

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
  const col =
    st === 'done' || (st as string) === 'completed'
      ? 'var(--success)'
      : st === 'processing'
        ? accentColor
        : st === 'queued'
          ? 'var(--text-secondary)'
          : 'var(--text-dim)';

  const itemPath = file.filePath || file.path || '';
  const itemSrc = itemPath ? getMediaSrc(itemPath) : '';

  return (
    <div
      onClick={() => onSelect(file.id)}
      draggable
      onDragStart={(e) => onDragStart(index, e)}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      className="relative flex items-center cursor-pointer group transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={{
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
        transform: open
          ? 'none'
          : `translateX(${active ? 5 : 0}px) scale(${active ? 1 : 0.9})`,
        transformOrigin: 'center left',
      }}
    >
      {/* Real Thumbnail */}
      <div
        className="flex-none relative overflow-hidden bg-[#1B1917]"
        style={{
          width: open ? (active ? 44 : 40) : 46,
          height: open ? (active ? 44 : 40) : 46,
          border: `1px solid ${active ? accentColor : open ? 'var(--border-default)' : '#3E3933'}`,
          borderRadius: open ? 9 : 11,
          boxShadow: open
            ? 'none'
            : active
              ? '0 12px 30px rgba(0,0,0,.7)'
              : '0 6px 18px rgba(0,0,0,.5)',
          transition: `all .24s ${EASE}`,
        }}
      >
        {itemSrc && !file.isVideo ? (
          <img src={itemSrc} alt="" className="w-full h-full object-cover" />
        ) : null}
        <span
          className="absolute bottom-0 left-0 right-0 py-[1px] text-center bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[7px] tracking-[0.06em]"
          style={{ color: col }}
        >
          {file.isVideo ? 'VID' : 'IMG'}
        </span>
      </div>

      {/* Text info */}
      <div
        className="flex-1 min-w-0"
        style={{ display: open ? 'block' : 'none' }}
      >
        <div className="text-[11.5px] font-medium text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
          {file.name}
        </div>
        {file.w && file.h ? (
          <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-muted)] tracking-[0.03em] whitespace-nowrap overflow-hidden text-ellipsis">
            {file.w}×{file.h}
          </div>
        ) : null}
      </div>

      {/* Remove button */}
      {onRemoveItem && open && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveItem(file.id);
          }}
          className="w-4 h-4 hidden group-hover:flex items-center justify-center rounded text-[var(--danger-text)] text-xs transition-all duration-150 hover:scale-110"
        >
          ×
        </button>
      )}

      {/* Status */}
      <div
        className="flex-none font-['Martian_Mono',monospace] text-[9px]"
        style={{ display: open ? 'block' : 'none', color: col }}
      >
        {st === 'done' || (st as string) === 'completed'
          ? '✓'
          : st === 'processing'
            ? `${Math.round(file.progress)}%`
            : st === 'queued'
              ? '···'
              : ''}
      </div>

      {/* Cancel item button if processing */}
      {onCancelItem && st === 'processing' && (
        <button
          onClick={() => onCancelItem(file.id)}
          className="text-[9px] text-[var(--danger-text)] ml-1 transition-all duration-150 hover:scale-110"
        >
          ✕
        </button>
      )}

      {/* Progress bar */}
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

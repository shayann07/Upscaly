import { memo } from 'react';
import { QueueItem } from '../../store/queueItem';
import { BatchQueueRowThumbnail } from './BatchQueueRowThumbnail';
import { BatchQueueRowControls } from './BatchQueueRowControls';

interface BatchQueueRowProps {
  file: QueueItem;
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
  if (status === 'succeeded') return 'var(--success)';
  if (status === 'running') return accentColor;
  if (status === 'queued') return 'var(--text-secondary)';
  if (status === 'failed') return 'var(--danger-text)';
  return 'var(--text-dim)';
}

/**
 * The row's status glyph.
 *
 * A failure used to render as an empty string, indistinguishable from a
 * cancelled or not-yet-started row -- the only report of it was a toast
 * that removed itself after five seconds. A job that fails while nobody is
 * watching therefore left no trace anywhere in the UI, which is exactly how
 * a 50-minute video job came to look like it had simply never finished.
 * The row now says so, permanently, until the user clears it.
 */
function getItemStatusLabel(status: string, progress: number): string {
  if (status === 'succeeded') return '✓';
  if (status === 'running') return `${Math.round(progress)}%`;
  if (status === 'queued') return '···';
  if (status === 'failed') return '!';
  return '';
}

function getRowStyle(
  open: boolean,
  active: boolean,
  index: number,
  failed: boolean
): React.CSSProperties {
  return {
    gap: open ? 11 : 0,
    justifyContent: open ? 'flex-start' : 'center',
    padding: open ? '6px' : '0',
    marginBottom: open ? 3 : -13,
    borderRadius: open ? 10 : 12,
    // A failed row keeps its border and tint whether or not it is selected:
    // the whole point is that it stays visible without being looked for.
    border: `1px solid ${failed ? 'var(--border-danger)' : open && active ? 'var(--border-subtle)' : 'transparent'}`,
    background: failed ? 'var(--danger-bg)' : open && active ? 'var(--bg-active)' : 'transparent',
    overflow: open ? 'hidden' : 'visible',
    zIndex: active ? 40 : 20 - index,
    opacity: failed || open || active ? 1 : 0.66,
    transform: open ? 'none' : `translateX(${active ? 5 : 0}px) scale(${active ? 1 : 0.9})`,
    transformOrigin: 'center left',
    // Named properties rather than `transition-all`. The row rewrites
    // padding, gap, radius, border and transform whenever selection
    // changes, and `all` made the browser animate every one of them
    // together -- on a list that also re-renders on progress ticks, that
    // is the stutter when clicking between items mid-batch. Transform and
    // opacity are compositor-only; the rest are cheap discrete swaps.
    transition:
      'transform .24s var(--ease-spring), opacity .24s ease, background-color .18s ease, border-color .18s ease',
    willChange: 'transform',
  };
}

// Batch progress events can fire 10+/sec; setBatchItems' .map() keeps the
// same object reference for every item except the one whose event just
// arrived. Memoizing lets every other row skip re-rendering on each tick
// instead of the whole list re-rendering for one row's progress change --
// this only actually works because the callback props below (onSelect,
// onDragStart/Enter/End, onRemoveItem, onCancelItem) are now kept stable
// by their callers (StudioCanvas, BatchQueueView) rather than being fresh
// inline closures on every parent render.
export const BatchQueueRow = memo(function BatchQueueRow({
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
  const failed = st === 'failed';

  return (
    <div
      onClick={() => onSelect(file.id)}
      draggable
      onDragStart={(e) => onDragStart(index, e)}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      className="relative flex items-center cursor-pointer group hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
      style={getRowStyle(open, active, index, failed)}
      // The error text is the row's tooltip in the collapsed rail too, so
      // the reason is one hover away without expanding the queue.
      title={failed && file.error ? file.error : undefined}
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
          {file.fileName || 'Untitled'}
        </div>
        {file.w && file.h ? (
          <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-muted)] tracking-[0.03em] whitespace-nowrap overflow-hidden text-ellipsis">
            {file.w}×{file.h}
          </div>
        ) : null}
        {st === 'running' && (
          <div className="mt-1 h-[3px] rounded-full bg-[var(--bg-base)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${file.progress}%`,
                background: accentColor,
                transition: 'width .25s linear',
              }}
            />
          </div>
        )}
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

      {/*
        The progress line used to be absolutely positioned across the whole
        row at h-0.5. Collapsed, the row is only as wide as its thumbnail
        but the bar still spanned the row box, so it rendered as a detached
        red line floating below the tile. Expanded, it was a hairline welded
        to the row's bottom edge, cutting the border.

        Progress now lives where the eye already is: a track under the file
        name when expanded, and a fill across the base of the thumbnail
        itself when collapsed.
      */}
    </div>
  );
});

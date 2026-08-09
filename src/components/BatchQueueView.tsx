import { useState, useCallback } from 'react';
import { BatchItem } from '../lib/types';
import { getMediaSrc } from '../lib/media';

export type { BatchItem };

interface BatchQueueViewProps {
  items: BatchItem[];
  currentIndex?: number;
  selectedId?: string | undefined;
  accentColor?: string;
  onSelect?: (id: string) => void;
  onReorder?: (items: BatchItem[]) => void;
  onAddFiles?: () => void;
  onClear?: () => void;
  selectedScale?: number;
  currentFileDims?: { w: number; h: number } | null;
  // Alternate prop names support
  onRemoveItem?: (id: string) => void;
  onClearCompleted?: () => void;
  onAddMoreFiles?: () => void;
  onOpenFileNative?: (path: string) => void;
  onShowInExplorerNative?: (path: string) => void;
  onCancelItem?: (id: string) => void;
}

export function BatchQueueView({
  items,
  currentIndex = 0,
  selectedId,
  accentColor = 'var(--accent)',
  onSelect = () => {},
  onReorder = () => {},
  onAddFiles,
  onClear,
  selectedScale = 4,
  currentFileDims,
  onRemoveItem,
  onClearCompleted,
  onAddMoreFiles,
  onCancelItem,
}: BatchQueueViewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const handleAdd = onAddFiles || onAddMoreFiles || (() => {});
  const handleClearAll = onClear || onClearCompleted || (() => {});

  const open = isHovered;
  const EASE = 'var(--ease-spring)';

  const currentItem = items.find((i) => i.id === selectedId) || items[currentIndex] || items[0];
  const curW = currentItem ? currentItem.w || 0 : currentFileDims?.w || 0;
  const curH = currentItem ? currentItem.h || 0 : currentFileDims?.h || 0;
  const outW = curW * selectedScale;
  const outH = curH * selectedScale;
  const estMb = ((outW * outH * 3) / 1048576).toFixed(1);

  const doneCount = items.filter(
    (f) => f.status === 'done' || (f.status as string) === 'completed'
  ).length;
  const batchPct = items.length
    ? Math.round(
        items.reduce(
          (a, f) =>
            a + (f.status === 'done' || (f.status as string) === 'completed' ? 100 : f.progress),
          0
        ) / items.length
      )
    : 0;

  const handleDragStart = useCallback((idx: number, e: React.DragEvent) => {
    setDragFrom(idx);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnter = useCallback(
    (idx: number) => {
      if (dragFrom === null || dragFrom === idx) return;
      const from = dragFrom;
      setDragFrom(idx);
      const newItems = [...items];
      newItems.splice(idx, 0, newItems.splice(from, 1)[0]);
      onReorder(newItems);
    },
    [dragFrom, items, onReorder]
  );

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="absolute left-3 top-14 z-[36] flex flex-col overflow-hidden"
      style={{
        maxHeight: 'calc(100% - 148px)',
        width: open ? 264 : 56,
        border: `1px solid ${open ? 'var(--border-subtle)' : 'transparent'}`,
        borderRadius: 14,
        background: open ? 'rgba(13,12,11,.96)' : 'transparent',
        boxShadow: open ? '0 16px 40px rgba(0,0,0,.62)' : 'none',
        overflow: open ? 'hidden' : 'visible',
        transition: `width .28s ${EASE}, background .28s ease, border-color .28s ease, box-shadow .28s ease`,
      }}
    >
      {/* Header */}
      <div
        className="flex-none flex items-center"
        style={{
          height: open ? 30 : 18,
          justifyContent: open ? 'flex-start' : 'center',
          gap: 7,
          padding: `0 ${open ? 12 : 0}px`,
          borderBottom: `1px solid ${open ? 'var(--border-default)' : 'transparent'}`,
          transition: `all .28s ${EASE}`,
        }}
      >
        <span
          className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[var(--text-dim)]"
          style={{ display: open ? 'inline' : 'none' }}
        >
          QUEUE
        </span>
        <span
          className="font-['Martian_Mono',monospace] tracking-[0.08em]"
          style={{
            fontSize: open ? 10 : 9,
            color: open ? 'var(--text-secondary)' : 'var(--text-muted)',
            transition: `all .28s ease`,
          }}
        >
          {String(items.length).padStart(2, '0')}
        </span>
      </div>

      {/* Batch progress bar */}
      {open && items.length > 0 && (
        <div className="flex-none px-2 pb-2">
          <div className="h-[3px] rounded-sm bg-[#1B1917] overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${batchPct}%`,
                background: accentColor,
                transition: `width .3s ${EASE}`,
              }}
            />
          </div>
          <div className="flex justify-between mt-[7px] font-['Martian_Mono',monospace] text-[9px] text-[var(--text-muted)] tracking-[0.04em]">
            <span>{String(doneCount).padStart(2, '0')} DONE</span>
            <span>{batchPct}%</span>
          </div>
        </div>
      )}

      {/* File list */}
      <div
        style={{
          flex: '0 1 auto',
          overflow: open ? 'hidden auto' : 'visible',
          minHeight: 0,
          padding: open ? '0 8px 8px' : '4px 0 18px',
        }}
      >
        {items.map((f, idx) => {
          const active = f.id === selectedId;
          const st = f.status;
          const col =
            st === 'done' || (st as string) === 'completed'
              ? 'var(--success)'
              : st === 'processing'
                ? accentColor
                : st === 'queued'
                  ? 'var(--text-secondary)'
                  : 'var(--text-dim)';
          const itemPath = f.filePath || f.path || '';
          const itemSrc = itemPath ? getMediaSrc(itemPath) : '';

          return (
            <div
              key={f.id}
              onClick={() => onSelect(f.id)}
              draggable
              onDragStart={(e) => handleDragStart(idx, e)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => setDragFrom(null)}
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
                zIndex: active ? 40 : 20 - idx,
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
                {itemSrc && !f.isVideo ? (
                  <img src={itemSrc} alt="" className="w-full h-full object-cover" />
                ) : null}
                <span
                  className="absolute bottom-0 left-0 right-0 py-[1px] text-center bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[7px] tracking-[0.06em]"
                  style={{ color: col }}
                >
                  {f.isVideo ? 'VID' : 'IMG'}
                </span>
              </div>

              {/* Text info */}
              <div className="flex-1 min-w-0" style={{ display: open ? 'block' : 'none' }}>
                <div className="text-[11.5px] font-medium text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
                  {f.name}
                </div>
                {f.w && f.h ? (
                  <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-muted)] tracking-[0.03em] whitespace-nowrap overflow-hidden text-ellipsis">
                    {f.w}×{f.h}
                  </div>
                ) : null}
              </div>

              {/* Remove button if onRemoveItem present */}
              {onRemoveItem && open && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveItem(f.id);
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
                    ? `${Math.round(f.progress)}%`
                    : st === 'queued'
                      ? '···'
                      : ''}
              </div>

              {/* Cancel item button if processing */}
              {onCancelItem && st === 'processing' && (
                <button
                  onClick={() => onCancelItem(f.id)}
                  className="text-[9px] text-[var(--danger-text)] ml-1 transition-all duration-150 hover:scale-110"
                >
                  ✕
                </button>
              )}

              {/* Progress bar */}
              <div
                className="absolute left-0 bottom-0 h-0.5"
                style={{
                  width: `${st === 'processing' ? f.progress : 0}%`,
                  background: accentColor,
                  transition: 'width .2s linear',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div
        className="flex-none gap-[5px] p-2 border-t border-[var(--border-default)]"
        style={{
          display: open ? 'flex' : 'none',
          transition: `all .28s ${EASE}`,
        }}
      >
        <button
          onClick={handleAdd}
          className="flex-1 h-8 flex items-center justify-center gap-[7px] border border-[var(--border-default)] rounded-[9px] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
        >
          <span className="text-sm leading-none">+</span>
          <span>Add files</span>
        </button>
        <button
          onClick={handleClearAll}
          className="w-10 h-8 flex items-center justify-center border border-[var(--border-default)] rounded-[9px] bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-['Martian_Mono',monospace] text-[9px] cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:bg-[var(--danger-hover)] hover:text-[var(--danger-text)] hover:border-[var(--border-danger)] hover:shadow-[0_0_12px_rgba(232,138,128,0.25)]"
        >
          CLR
        </button>
      </div>

      {/* ESTIMATE section matching handoff */}
      {open && items.length > 0 && curW > 0 && (
        <div className="flex-none p-2.5 border-t border-[var(--border-default)] flex flex-col gap-1">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)]">
            ESTIMATE
          </div>
          <div className="font-['Martian_Mono',monospace] text-[10px] text-[var(--text-secondary)] whitespace-nowrap">
            {curW}×{curH} → {outW}×{outH}
          </div>
          <div className="font-['Martian_Mono',monospace] text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
            ~{estMb} MB
          </div>
        </div>
      )}

      {/* Add button when collapsed */}
      {!open && (
        <div className="flex-none" style={{ padding: '4px 0 0' }}>
          <button
            onClick={handleAdd}
            className="w-[46px] h-[30px] mx-auto flex items-center justify-center border border-dashed border-[#332E29] rounded-[11px] bg-[rgba(13,12,11,.8)] text-[var(--text-tertiary)] text-sm cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

export default BatchQueueView;

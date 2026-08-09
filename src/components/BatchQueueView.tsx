import { useState, useCallback } from 'react';
import { BatchItem } from '../lib/types';
import { BatchQueueHeader } from './batch/BatchQueueHeader';
import { BatchQueueRow } from './batch/BatchQueueRow';

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

  const currentItem =
    items.find((i) => i.id === selectedId) || items[currentIndex] || items[0];
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
            a +
            (f.status === 'done' || (f.status as string) === 'completed'
              ? 100
              : f.progress),
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
      <BatchQueueHeader
        open={open}
        itemCount={items.length}
        doneCount={doneCount}
        batchPct={batchPct}
        accentColor={accentColor}
        EASE={EASE}
      />

      <div
        style={{
          flex: '0 1 auto',
          overflow: open ? 'hidden auto' : 'visible',
          minHeight: 0,
          padding: open ? '0 8px 8px' : '4px 0 18px',
        }}
      >
        {items.map((f, idx) => (
          <BatchQueueRow
            key={f.id}
            file={f}
            index={idx}
            open={open}
            active={f.id === selectedId}
            accentColor={accentColor}
            EASE={EASE}
            onSelect={onSelect}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragEnd={() => setDragFrom(null)}
            onRemoveItem={onRemoveItem}
            onCancelItem={onCancelItem}
          />
        ))}
      </div>

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

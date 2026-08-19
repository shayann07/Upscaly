import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { QueueItem } from '../store/queueItem';
import { BatchQueueHeader } from './batch/BatchQueueHeader';
import { BatchQueueRow } from './batch/BatchQueueRow';
import { BatchQueueFooter } from './batch/BatchQueueFooter';

// Module-level (not re-created per render) so an omitted onSelect/onReorder
// prop doesn't hand BatchQueueRow a fresh function identity on every
// render, which would defeat its React.memo just as surely as an inline
// `() => {}` default would.
const NOOP_SELECT = (_id: string) => {};
const NOOP_REORDER = (_items: QueueItem[]) => {};
const NOOP = () => {};

interface BatchQueueViewProps {
  items: QueueItem[];
  currentIndex?: number;
  selectedId?: string | undefined;
  accentColor?: string;
  onSelect?: (id: string) => void;
  onReorder?: (items: QueueItem[]) => void;
  onAddFiles?: () => void;
  onClear?: () => void;
  selectedScale?: number;
  currentFileDims?: { w: number; h: number } | null;
  onRemoveItem?: (id: string) => void;
  onCancelItem?: (id: string) => void;
}

function computeBatchStats(items: QueueItem[]) {
  const doneCount = items.filter((f) => f.status === 'succeeded').length;
  const batchPct = items.length
    ? Math.round(
        items.reduce((a, f) => a + (f.status === 'succeeded' ? 100 : f.progress), 0) / items.length
      )
    : 0;
  return { doneCount, batchPct };
}

function computeEstimateData(
  items: QueueItem[],
  selectedId: string | undefined,
  currentIndex: number,
  currentFileDims: { w: number; h: number } | null | undefined,
  selectedScale: number
) {
  const item = items.find((i) => i.id === selectedId) || items[currentIndex] || items[0];
  // Dimensions are null until the probe resolves (and stay null if it
  // fails). The estimate is simply not shown in that case rather than being
  // computed from a stand-in figure.
  const curW = item?.w ?? currentFileDims?.w ?? 0;
  const curH = item?.h ?? currentFileDims?.h ?? 0;
  const outW = curW * selectedScale;
  const outH = curH * selectedScale;
  const estMb = ((outW * outH * 3) / 1048576).toFixed(1);
  return { curW, curH, outW, outH, estMb };
}

function BatchQueueViewImpl(props: BatchQueueViewProps) {
  const {
    items,
    currentIndex = 0,
    selectedId,
    accentColor = 'var(--accent)',
    onSelect = NOOP_SELECT,
    onReorder = NOOP_REORDER,
    onAddFiles = NOOP,
    onClear = NOOP,
    selectedScale = 4,
    currentFileDims,
    onRemoveItem,
    onCancelItem,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // Read via refs (not closed over directly) so handleDragEnter/
  // handleDragEnd keep a stable identity across re-renders -- items in
  // particular gets a fresh array reference on every progress tick, which
  // would otherwise force every row's onDragEnter/onDragEnd prop to change
  // just as often, defeating BatchQueueRow's React.memo for the entire
  // list on every tick rather than just the row that actually updated.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const dragFromRef = useRef(dragFrom);
  useEffect(() => {
    dragFromRef.current = dragFrom;
  }, [dragFrom]);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const handleDragStart = useCallback((idx: number, e: React.DragEvent) => {
    setDragFrom(idx);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnter = useCallback(
    (idx: number) => {
      const from = dragFromRef.current;
      if (from === null || from === idx) return;
      setDragFrom(idx);
      const newItems = [...itemsRef.current];
      newItems.splice(idx, 0, newItems.splice(from, 1)[0]);
      onReorder(newItems);
    },
    [onReorder]
  );

  const handleDragEnd = useCallback(() => setDragFrom(null), []);

  if (items.length === 0) {
    return null;
  }

  const open = isHovered;
  const EASE = 'var(--ease-spring)';

  const { doneCount, batchPct } = computeBatchStats(items);
  const { curW, curH, outW, outH, estMb } = computeEstimateData(
    items,
    selectedId,
    currentIndex,
    currentFileDims,
    selectedScale
  );

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="app-enter-content absolute left-3 top-14 z-[36] flex flex-col overflow-hidden"
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
            onDragEnd={handleDragEnd}
            onRemoveItem={onRemoveItem}
            onCancelItem={onCancelItem}
          />
        ))}
      </div>

      <BatchQueueFooter
        open={open}
        EASE={EASE}
        itemCount={items.length}
        curW={curW}
        curH={curH}
        outW={outW}
        outH={outH}
        estMb={estMb}
        onAdd={onAddFiles}
        onClearAll={onClear}
      />
    </div>
  );
}

export const BatchQueueView = memo(BatchQueueViewImpl);

export default BatchQueueView;

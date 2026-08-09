interface BatchQueueHeaderProps {
  open: boolean;
  itemCount: number;
  doneCount: number;
  batchPct: number;
  accentColor: string;
  EASE: string;
}

export function BatchQueueHeader({
  open,
  itemCount,
  doneCount,
  batchPct,
  accentColor,
  EASE,
}: BatchQueueHeaderProps) {
  return (
    <>
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
          {String(itemCount).padStart(2, '0')}
        </span>
      </div>

      {open && itemCount > 0 && (
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
    </>
  );
}

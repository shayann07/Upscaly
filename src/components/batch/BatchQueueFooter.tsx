import { BatchQueueEstimate } from './BatchQueueEstimate';

interface BatchQueueFooterProps {
  open: boolean;
  EASE: string;
  itemCount: number;
  curW: number;
  curH: number;
  outW: number;
  outH: number;
  estMb: string;
  onAdd: () => void;
  onClearAll: () => void;
}

export function BatchQueueFooter({
  open,
  EASE,
  itemCount,
  curW,
  curH,
  outW,
  outH,
  estMb,
  onAdd,
  onClearAll,
}: BatchQueueFooterProps) {
  return (
    <>
      <div
        className="flex-none gap-[5px] p-2 border-t border-[var(--border-default)]"
        style={{
          display: open ? 'flex' : 'none',
          transition: `all .28s ${EASE}`,
        }}
      >
        <button
          onClick={onAdd}
          className="flex-1 h-8 flex items-center justify-center gap-[7px] border border-[var(--border-default)] rounded-[9px] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
        >
          <span className="text-sm leading-none">+</span>
          <span>Add files</span>
        </button>
        <button
          onClick={onClearAll}
          className="w-10 h-8 flex items-center justify-center border border-[var(--border-default)] rounded-[9px] bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-['Martian_Mono',monospace] text-[9px] cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:bg-[var(--danger-hover)] hover:text-[var(--danger-text)] hover:border-[var(--border-danger)] hover:shadow-[0_0_12px_rgba(232,138,128,0.25)]"
        >
          CLR
        </button>
      </div>

      <BatchQueueEstimate
        open={open}
        itemCount={itemCount}
        curW={curW}
        curH={curH}
        outW={outW}
        outH={outH}
        estMb={estMb}
      />

      {!open && (
        <div className="flex-none" style={{ padding: '4px 0 0' }}>
          <button
            onClick={onAdd}
            className="w-[46px] h-[30px] mx-auto flex items-center justify-center border border-dashed border-[#332E29] rounded-[11px] bg-[rgba(13,12,11,.8)] text-[var(--text-tertiary)] text-sm cursor-pointer transition-all duration-200 hover:scale-[1.05] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
          >
            +
          </button>
        </div>
      )}
    </>
  );
}

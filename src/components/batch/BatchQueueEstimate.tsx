interface BatchQueueEstimateProps {
  open: boolean;
  itemCount: number;
  curW: number;
  curH: number;
  outW: number;
  outH: number;
  estMb: string;
}

export function BatchQueueEstimate({
  open,
  itemCount,
  curW,
  curH,
  outW,
  outH,
  estMb,
}: BatchQueueEstimateProps) {
  if (!open || itemCount === 0 || curW === 0) return null;

  return (
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
  );
}

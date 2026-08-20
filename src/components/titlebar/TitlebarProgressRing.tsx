import { memo } from 'react';
import { useQueueBatchSummary } from '../../store/selectors';

interface TitlebarProgressRingProps {
  accentColor?: string;
}

export const TitlebarProgressRing = memo(function TitlebarProgressRing({
  accentColor = 'var(--accent)',
}: TitlebarProgressRingProps) {
  const { total, completed, isProcessing } = useQueueBatchSummary();

  if (!isProcessing && completed === 0) return null;
  if (total <= 1 && !isProcessing) return null;

  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div
      title={`Batch Progress: ${completed} of ${total} completed (${pct}%)`}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-[9px] border border-[var(--border-subtle)] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] transition-all duration-200 pointer-events-auto"
    >
      <div className="relative w-[22px] h-[22px] flex items-center justify-center flex-none">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.35s ease',
            }}
          />
        </svg>
      </div>

      <span className="font-['Martian_Mono',monospace] text-[9.5px] font-semibold text-[var(--text-primary)] tracking-[0.04em]">
        {completed}/{total}
      </span>
    </div>
  );
});

export default TitlebarProgressRing;

import { memo } from 'react';

interface StudioGridOverlayProps {
  progressVal: number;
}

// Renders 48 divs purely from progressVal. Memoized so a re-render
// elsewhere in the app (unrelated state, a sibling prop changing) doesn't
// force this grid to recompute and re-diff on every parent render --
// StudioCanvas alone re-renders on every job-status-changed event, which
// can fire 10+ times a second while a job is running.
export const StudioGridOverlay = memo(function StudioGridOverlay({
  progressVal,
}: StudioGridOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(6, 1fr)',
        gap: '1px',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {Array.from({ length: 48 }).map((_, i) => {
        const cutoff = (progressVal / 100) * 48;
        const state =
          i < Math.floor(cutoff) ? 'done' : i < Math.ceil(cutoff) ? 'active' : 'pending';
        return (
          <div
            key={i}
            style={{
              background:
                state === 'done'
                  ? 'transparent'
                  : state === 'active'
                    ? 'rgba(168,11,36,.16)'
                    : 'rgba(9,8,8,.72)',
              boxShadow: state === 'active' ? 'inset 0 0 0 1px #A80B24' : 'none',
              transition: 'background .3s ease',
            }}
          />
        );
      })}
    </div>
  );
});

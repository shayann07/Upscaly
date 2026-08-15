import { useStudioContainerSetup } from '../../hooks/useStudioContainerSetup';
import { StudioCanvas } from './StudioCanvas';
import { StudioModals } from './StudioModals';

export function StudioLayoutContainer() {
  const { isDragOver } = useStudioContainerSetup();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-stripe)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Both children read the store directly. This used to hand them 50
          and 20 props respectively, spread out of a single merged object,
          which meant any change anywhere re-rendered the entire tree. */}
      <StudioCanvas isDragOver={isDragOver} />
      <StudioModals />
    </div>
  );
}

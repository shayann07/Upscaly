import { memo } from 'react';
import { STRINGS } from '../lib/strings';
interface DropZoneProps {
  isDragOver: boolean;
  onAddFiles?: () => void;
  onAddBatch?: () => void;
  accentColor?: string;
  // Alternate prop names support
  onFileSelect?: (files: File[]) => void;
  onBrowseClick?: () => void;
  setIsDragOver?: (over: boolean) => void;
}

function DropZoneImpl({
  isDragOver,
  onAddFiles,
  onAddBatch,
  accentColor = 'var(--accent)',
  onFileSelect: _onFileSelect,
  onBrowseClick,
  setIsDragOver: _setIsDragOver,
}: DropZoneProps) {
  const borderColor = isDragOver ? accentColor : '#312C27';

  const handleAdd = onAddFiles || onBrowseClick || (() => {});
  const handleBatch = onAddBatch || onBrowseClick || (() => {});

  return (
    <div
      className="relative border rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-modal)]"
      style={{
        width: 'min(516px, calc(100% - 48px))',
        border: `1px solid var(--border-subtle)`,
        background: 'rgba(13,12,11,.97)',
        boxShadow: '0 30px 74px rgba(0,0,0,.62)',
        animation: 'pop .4s var(--ease-spring) both',
      }}
    >
      <div
        className="relative flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-200"
        style={{
          padding: '44px 32px 40px',
          background: isDragOver ? 'var(--accent-subtle)' : 'transparent',
        }}
      >
        {/* Decorative blocks matching design handoff */}
        <div className="flex items-end gap-[9px] mb-[22px]">
          <div className="w-[22px] h-[22px] rounded-[3px] border border-[var(--border-subtle)] bg-[#26221E]" />
          <div
            className="w-8 h-8 rounded-[3px] border border-[#3A352F]"
            style={{
              background:
                'linear-gradient(#0B0A09 1px, transparent 1px) 0 0/100% 16px, linear-gradient(90deg, #0B0A09 1px, transparent 1px) 0 0/16px 100%, #312C27',
            }}
          />
          <div
            className="w-[46px] h-[46px] rounded-[4px] transition-colors duration-200"
            style={{
              border: `1px solid ${borderColor}`,
              background:
                'linear-gradient(#0B0A09 1px, transparent 1px) 0 0/100% 8px, linear-gradient(90deg, #0B0A09 1px, transparent 1px) 0 0/8px 100%, #443E37',
            }}
          />
        </div>

        <div className="text-[21px] font-semibold tracking-[-0.02em] mb-2">
          {isDragOver ? STRINGS.DROP_ACTIVE : STRINGS.DROP_IDLE}
        </div>
        <div className="text-[12.5px] text-[var(--text-tertiary)] leading-[1.5] max-w-[300px]">
          {STRINGS.DROP_SUBTITLE}
        </div>
        <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.07em] text-[var(--text-ghost)] mt-3.5">
          {STRINGS.DROP_FORMATS}
        </div>

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={handleAdd}
            className="h-[38px] px-5 flex items-center gap-[9px] border-none rounded-[9px] bg-[var(--text-primary)] text-[var(--bg-base)] font-['Archivo',sans-serif] text-[12.5px] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:shadow-[0_4px_16px_rgba(255,255,255,0.25)]"
          >
            {STRINGS.CHOOSE_FILES}
          </button>
          <button
            onClick={handleBatch}
            className="h-[38px] px-4 border border-[var(--border-subtle)] rounded-[9px] bg-transparent text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[12.5px] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] hover:bg-[#161514] hover:shadow-[var(--shadow-pill-hover)]"
          >
            {STRINGS.CHOOSE_FOLDER}
          </button>
        </div>
      </div>
    </div>
  );
}

export const DropZone = memo(DropZoneImpl);

export default DropZone;

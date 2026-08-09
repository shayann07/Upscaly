import { ModelInfo } from '../../lib/types';

interface ModelSelectorDropdownProps {
  big: boolean;
  EASE: string;
  model: ModelInfo;
  modelMenuOpen: boolean;
  setModelMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  filteredModels: ModelInfo[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  onOpenCatalog: () => void;
  accentColor: string;
}

export function ModelSelectorDropdown({
  big,
  EASE,
  model,
  modelMenuOpen,
  setModelMenuOpen,
  filteredModels,
  selectedModel,
  onSelectModel,
  onOpenCatalog,
  accentColor,
}: ModelSelectorDropdownProps) {
  return (
    <div
      className="relative flex-none"
      style={{ width: big ? 206 : 162, transition: `width .24s ${EASE}` }}
    >
      <button
        onClick={() => setModelMenuOpen((prev) => !prev)}
        className="w-full flex items-center gap-[9px] border border-[var(--border-default)] rounded-[11px] bg-[var(--bg-elevated)] cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
        style={{ height: big ? 36 : 30, padding: '0 11px' }}
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
            {model.name}
          </div>
          {big && (
            <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
              {model.id.toUpperCase()} · {model.size}
            </div>
          )}
        </div>
        <span className="flex-none text-[var(--text-dim)] text-[9px]">▲</span>
      </button>

      {modelMenuOpen && (
        <div
          className="absolute bottom-[calc(100%+10px)] left-0 w-[376px] border border-[var(--border-subtle)] rounded-[14px] bg-[var(--bg-surface)] shadow-[0_24px_60px_rgba(0,0,0,.7)] p-2 z-[80]"
          style={{ animation: 'pop .2s var(--ease-bounce) both' }}
        >
          {filteredModels.map((m: ModelInfo) => (
            <div
              key={m.id}
              onClick={() => {
                onSelectModel(m.id);
                setModelMenuOpen(false);
              }}
              className="flex items-start gap-3 p-3 rounded-[10px] cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-hover)]"
              style={{
                background: m.id === selectedModel ? 'var(--bg-active)' : 'transparent',
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[7px]">
                  <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {m.name}
                  </span>
                  <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.05em] px-1.5 py-[3px] rounded-[6px] border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
                    {m.scale}×
                  </span>
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)] mt-[3px] leading-[1.4]">
                  {m.note}
                </div>
              </div>
              {m.id === selectedModel && (
                <span className="flex-none w-3 text-[11px]" style={{ color: accentColor }}>
                  ✓
                </span>
              )}
            </div>
          ))}
          <div
            onClick={() => {
              setModelMenuOpen(false);
              onOpenCatalog();
            }}
            className="mt-1 px-2.5 py-[9px] border-t border-[var(--border-default)] font-['Martian_Mono',monospace] text-[10px] tracking-[0.06em] text-[var(--accent)] cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:text-[var(--text-primary)]"
          >
            BROWSE FULL CATALOG →
          </div>
        </div>
      )}
    </div>
  );
}

import { useRef, useEffect } from 'react';
import { ModelInfo } from '../../lib/types';
import { studioActions } from '../../store/studioStore';

interface ModelSelectorDropdownProps {
  model: ModelInfo;
  modelMenuOpen: boolean;
  setModelMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  filteredModels: ModelInfo[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  onOpenCatalog: () => void;
  accentColor: string;
  installedModels?: string[];
}

export function ModelSelectorDropdown({
  model,
  modelMenuOpen,
  setModelMenuOpen,
  filteredModels,
  selectedModel,
  onSelectModel,
  onOpenCatalog,
  accentColor,
  installedModels = [],
}: ModelSelectorDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [modelMenuOpen, setModelMenuOpen]);

  const handleToggle = () => {
    setModelMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        studioActions.setActiveNavTab(null);
      }
      return next;
    });
  };

  return (
    <div ref={containerRef} className="relative flex-none w-[184px]">
      <button
        onClick={handleToggle}
        className="w-full h-[32px] flex items-center gap-2 px-2.5 border border-[var(--border-default)] rounded-[10px] bg-[var(--bg-elevated)] cursor-pointer transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[#1C1A18]"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[11.5px] font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
            {model.name}
          </div>
          <div className="font-['Martian_Mono',monospace] text-[8px] text-[var(--text-dim)] tracking-[0.03em] whitespace-nowrap overflow-hidden text-ellipsis leading-none mt-0.5">
            {model.id.toUpperCase()}
          </div>
        </div>
        <span className="flex-none text-[var(--text-dim)] text-[8px] opacity-70">▲</span>
      </button>

      {modelMenuOpen && (
        <div
          className="absolute bottom-[calc(100%+10px)] left-0 w-[376px] border border-[var(--border-subtle)] rounded-[14px] bg-[var(--bg-surface)] shadow-[0_24px_60px_rgba(0,0,0,.7)] p-2 z-[80]"
          style={{ animation: 'pop .2s var(--ease-bounce) both' }}
        >
          {filteredModels.map((m: ModelInfo) => {
            const isInstalled = installedModels.includes(m.id);
            return (
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
                    {!isInstalled && (
                      <span className="font-['Martian_Mono',monospace] text-[8.5px] text-[var(--text-ghost)] tracking-[0.04em]">
                        {m.size}
                      </span>
                    )}
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
            );
          })}
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

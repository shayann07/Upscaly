interface TitlebarNavProps {
  activeNavTab?: 'models' | 'history' | 'settings' | 'about' | null;
  onToggleNavTab?: ((tab: 'models' | 'history' | 'settings' | 'about') => void) | undefined;
  inspectorActive: boolean;
  handleCatalog: () => void;
  handleHistory: () => void;
  handleToggleInspector: () => void;
  handleAbout: () => void;
}

export function TitlebarNav({
  activeNavTab,
  onToggleNavTab,
  inspectorActive,
  handleCatalog,
  handleHistory,
  handleToggleInspector,
  handleAbout,
}: TitlebarNavProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 h-[34px] px-1.5 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]">
      <button
        onClick={() => (onToggleNavTab ? onToggleNavTab('models') : handleCatalog())}
        className={`px-2.5 py-1 border-none rounded-lg font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 ${
          activeNavTab === 'models'
            ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
            : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        Models
      </button>
      <button
        onClick={() => (onToggleNavTab ? onToggleNavTab('history') : handleHistory())}
        className={`px-2.5 py-1 border-none rounded-lg font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 ${
          activeNavTab === 'history'
            ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
            : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        History
      </button>
      <button
        onClick={() => (onToggleNavTab ? onToggleNavTab('settings') : handleToggleInspector())}
        className={`px-2.5 py-1 border-none rounded-lg font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 ${
          activeNavTab === 'settings' || inspectorActive
            ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
            : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        Settings
      </button>
      <button
        onClick={() => (onToggleNavTab ? onToggleNavTab('about') : handleAbout())}
        className={`w-6 h-6 flex items-center justify-center border-none rounded-md font-['Martian_Mono',monospace] text-xs font-semibold cursor-pointer transition-all duration-150 ${
          activeNavTab === 'about'
            ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
            : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        ?
      </button>
    </div>
  );
}

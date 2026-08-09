import { invoke } from '@tauri-apps/api/core';

export function WindowControls() {
  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch {
      // Ignored when window control fails in non-Tauri browser preview
    }
  };

  const handleMaximize = async () => {
    try {
      await invoke('toggle_maximize_window');
    } catch {
      // Ignored when window control fails in non-Tauri browser preview
    }
  };

  const handleClose = async () => {
    try {
      await invoke('close_window');
    } catch {
      // Ignored when window control fails in non-Tauri browser preview
    }
  };

  return (
    <div className="pointer-events-auto">
      <div className="flex items-center gap-2.5 h-[34px] px-3 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]">
        <div className="flex items-center gap-1.5 group">
          <div
            onClick={handleClose}
            className="w-[11px] h-[11px] rounded-full bg-[#FF5F56] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#4C0000]"
          >
            ×
          </div>
          <div
            onClick={handleMinimize}
            className="w-[11px] h-[11px] rounded-full bg-[#FFBD2E] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#523A00]"
          >
            −
          </div>
          <div
            onClick={handleMaximize}
            className="w-[11px] h-[11px] rounded-full bg-[#28C840] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#032C09]"
          >
            ▢
          </div>
        </div>
        <div className="w-px h-[15px] bg-[var(--border-default)]" />
        <span className="font-bold text-[12.5px] tracking-[-0.01em]">
          Upscaly
        </span>
        <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.06em]">
          0.1.0
        </span>
      </div>
    </div>
  );
}

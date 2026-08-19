import { invoke } from '@tauri-apps/api/core';
import {
  useAppName,
  useAppVersion,
  useAvailableUpdate,
  useUpdatePhase,
  useUpdateProgress,
} from '../../store/selectors';
import { downloadAndInstallUpdate } from '../../lib/updater';
import { UpdateBadge } from '../UpdateBadge';

export function WindowControls() {
  const appName = useAppName();
  const appVersion = useAppVersion();
  const availableUpdate = useAvailableUpdate();
  const updatePhase = useUpdatePhase();
  const updateProgress = useUpdateProgress();

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
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close window"
            className="w-[11px] h-[11px] p-0 border-0 appearance-none rounded-full bg-[#FF5F56] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#4C0000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 focus-visible:outline-offset-1"
          >
            ×
          </button>
          <button
            type="button"
            onClick={handleMinimize}
            aria-label="Minimize window"
            className="w-[11px] h-[11px] p-0 border-0 appearance-none rounded-full bg-[#FFBD2E] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#523A00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 focus-visible:outline-offset-1"
          >
            −
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            aria-label="Maximize window"
            className="w-[11px] h-[11px] p-0 border-0 appearance-none rounded-full bg-[#28C840] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#032C09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 focus-visible:outline-offset-1"
          >
            ▢
          </button>
        </div>
        <div className="w-px h-[15px] bg-[var(--border-default)]" />
        <span className="font-bold text-[12.5px] tracking-[-0.01em]">{appName || 'Upscaly'}</span>
        {/*
          Read from Tauri's app metadata rather than written here. The
          literal that used to sit in this slot would have kept reporting
          0.1.0 no matter what version was actually shipped.
        */}
        {appVersion && (
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.06em]">
            {appVersion}
          </span>
        )}
        {/*
          import.meta.env.DEV is Vite's own dev-vs-build flag, true only
          when this is served by `vite`/`tauri dev` and false in the built
          bundle `tauri build` ships -- so this needs no plumbing from the
          Rust side to track which mode the app is actually running in.
        */}
        {import.meta.env.DEV && (
          <span
            className="font-['Martian_Mono',monospace] text-[9px] font-bold tracking-[0.08em] px-1 py-px rounded-[3px] border"
            style={{
              color: '#E8B980',
              borderColor: 'rgba(232,185,128,.35)',
              background: 'rgba(232,185,128,.08)',
            }}
            title="Running via tauri:dev -- separate data from the installed app"
          >
            DEV
          </span>
        )}

        {availableUpdate && (
          <>
            <div className="w-px h-[15px] bg-[var(--border-default)]" />
            <UpdateBadge
              version={availableUpdate.version}
              notes={availableUpdate.notes}
              phase={updatePhase}
              progress={updateProgress}
              onInstall={downloadAndInstallUpdate}
            />
          </>
        )}
      </div>
    </div>
  );
}

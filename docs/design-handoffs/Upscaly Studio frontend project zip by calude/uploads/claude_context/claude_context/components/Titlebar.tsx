import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ListPlus, SlidersHorizontal, Info, Clock, Cpu, Sparkle, Minus, Square, X } from "@phosphor-icons/react";

interface GpuDevice {
  id: number;
  name: string;
}

interface TitlebarProps {
  onShowModelCatalog: () => void;
  onShowSettings: () => void;
  onShowAbout: () => void;
  onShowHistory?: () => void;
  onToggleInspector?: () => void;
  isInspectorOpen?: boolean;
}

export function Titlebar({
  onShowModelCatalog,
  onShowSettings,
  onShowAbout,
  onShowHistory,
  onToggleInspector,
  isInspectorOpen = false,
}: TitlebarProps) {
  const [gpus, setGpus] = useState<GpuDevice[]>([]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const result: GpuDevice[] = await invoke("list_gpus");
        setGpus(result);
      } catch (err) {
        console.error("Failed to fetch GPUs:", err);
      }
    };
    fetchDevices();
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke("minimize_window");
    } catch (err) {
      console.error("Failed to minimize window:", err);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke("toggle_maximize_window");
    } catch (err) {
      console.error("Failed to toggle maximize window:", err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke("close_window");
    } catch (err) {
      console.error("Failed to close window:", err);
    }
  };

  const deviceLabel =
    gpus.length > 0
      ? `GPU ${gpus[0].id}: ${gpus[0].name}`
      : "CPU Fallback";

  return (
    <div className="h-10 bg-[#0F0F12] border-b border-[#272730] flex items-center justify-between px-3 select-none text-xs z-50 relative">
      {/* Native Drag Region Layer (behind buttons) */}
      <div data-tauri-drag-region className="absolute inset-0 z-0" />

      {/* Brand & App Title */}
      <div className="flex items-center gap-2.5 z-10 pointer-events-none">
        <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
          <Sparkle size={12} weight="fill" className="text-white" />
        </div>
        <span className="font-bold text-white tracking-wide font-sans">Upscaly Studio</span>
        <span className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-mono text-[10px]">
          v0.1.0
        </span>
      </div>

      {/* Center Static Hardware Device Readout */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#181820] border border-[#272730] text-zinc-400 text-[11px] font-mono z-10 pointer-events-none">
        <Cpu size={13} className="text-indigo-400" />
        <span className="truncate max-w-[240px]" title={deviceLabel}>
          {deviceLabel}
        </span>
      </div>

      {/* Right Titlebar Controls & Window Buttons */}
      <div className="flex items-center gap-1 z-10 relative">
        {onShowHistory && (
          <button
            type="button"
            onClick={onShowHistory}
            className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] hover:text-white transition-colors cursor-pointer"
            title="Recent Upscales History"
          >
            <Clock size={14} className="text-indigo-400" />
            <span>History</span>
          </button>
        )}
        <button
          type="button"
          onClick={onShowModelCatalog}
          className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] hover:text-white transition-colors cursor-pointer"
          title="Model Catalog"
        >
          <ListPlus size={14} />
          <span>Models</span>
        </button>
        <button
          type="button"
          onClick={onToggleInspector || onShowSettings}
          className={`h-7 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium border transition-colors cursor-pointer ${
            isInspectorOpen
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
              : 'bg-[#181820] text-zinc-400 border-[#272730] hover:text-white hover:bg-[#22222B]'
          }`}
          title="Toggle Inspector Panel (Tab)"
        >
          <SlidersHorizontal size={14} />
          <span>Inspector</span>
        </button>
        <button
          type="button"
          onClick={onShowAbout}
          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#181820] transition-colors cursor-pointer"
          title="About & Keyboard Hotkeys Guide"
        >
          <Info size={15} />
        </button>

        {/* Animated Window Control Dots */}
        <div className="flex items-center gap-2 pl-3 border-l border-[#272730] ml-1.5">
          <button
            type="button"
            onClick={handleMinimize}
            className="group relative w-3.5 h-3.5 rounded-full bg-amber-500/80 hover:bg-amber-400 flex items-center justify-center text-black/0 hover:text-black/80 transition-all cursor-pointer shadow-sm hover:scale-110 active:scale-95"
            title="Minimize Window"
          >
            <Minus size={9} weight="bold" className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="group relative w-3.5 h-3.5 rounded-full bg-emerald-500/80 hover:bg-emerald-400 flex items-center justify-center text-black/0 hover:text-black/80 transition-all cursor-pointer shadow-sm hover:scale-110 active:scale-95"
            title="Maximize / Restore Window"
          >
            <Square size={8} weight="bold" className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="group relative w-3.5 h-3.5 rounded-full bg-rose-500/80 hover:bg-rose-400 flex items-center justify-center text-black/0 hover:text-black/80 transition-all cursor-pointer shadow-sm hover:scale-110 active:scale-95"
            title="Close Application"
          >
            <X size={9} weight="bold" className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </div>
    </div>
  );
}

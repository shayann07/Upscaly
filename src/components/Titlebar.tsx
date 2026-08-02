import { useEffect, useState } from "react";
import { Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { ListPlus, Gear, Info, Monitor, Cpu, Sparkle } from "@phosphor-icons/react";
import { CustomSelect } from "./CustomSelect";

interface TitlebarProps {
  onShowModelCatalog: () => void;
  onShowSettings: () => void;
  onShowAbout: () => void;
}

export function Titlebar({
  onShowModelCatalog,
  onShowSettings,
  onShowAbout,
}: TitlebarProps) {
  const [appWindow, setAppWindow] = useState<Window | null>(null);
  const [deviceMap, setDeviceMap] = useState<Record<number, string>>({});
  const [devices, setDevices] = useState<{ value: number; label: string }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number>(-1); // -1 = CPU

  useEffect(() => {
    import("@tauri-apps/api/window").then((module) => {
      setAppWindow(module.getCurrentWindow());
    });

    const fetchDevices = async () => {
      try {
        const result: Record<number, string> = await invoke("get_gpus");
        setDeviceMap(result);
        
        const opts = [{ value: -1, label: "CPU (Fallback)" }];
        Object.entries(result).forEach(([id, name]) => {
          opts.push({ value: parseInt(id, 10), label: name });
        });
        setDevices(opts);
        
        if (Object.keys(result).length > 0) {
          const firstGpuId = parseInt(Object.keys(result)[0], 10);
          setSelectedDevice(firstGpuId);
          await invoke("set_device", { deviceId: firstGpuId });
        } else {
          setSelectedDevice(-1);
          await invoke("set_device", { deviceId: -1 });
        }
      } catch (err) {
        console.error("Failed to fetch GPUs:", err);
        setDevices([{ value: -1, label: "CPU (Fallback)" }]);
        setSelectedDevice(-1);
      }
    };
    fetchDevices();
  }, []);

  const handleDeviceChange = async (val: string | number) => {
    const id = typeof val === "string" ? parseInt(val, 10) : val;
    setSelectedDevice(id);
    try {
      await invoke("set_device", { deviceId: id });
    } catch (err) {
      console.error("Failed to set device:", err);
    }
  };

  const selectedDeviceName = selectedDevice === -1 ? "CPU" : deviceMap[selectedDevice] || "GPU";
  const isCpu = selectedDevice === -1;

  return (
    <div
      data-tauri-drag-region
      className="h-[48px] bg-[#0A0612]/60 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-4 select-none shrink-0"
    >
      {/* Left: Window Controls */}
      <div className="flex items-center gap-[10px] w-1/3">
        <button
          onClick={() => appWindow?.close()}
          className="w-3 h-3 rounded-full bg-[#ED6A5E] hover:scale-110 active:scale-95 transition-all shadow-[0_0_8px_rgba(237,106,94,0.3)] hover:shadow-[0_0_12px_rgba(237,106,94,0.6)] relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 rounded-full" />
        </button>
        <button
          onClick={() => appWindow?.minimize()}
          className="w-3 h-3 rounded-full bg-[#F4BF4F] hover:scale-110 active:scale-95 transition-all shadow-[0_0_8px_rgba(244,191,79,0.3)] hover:shadow-[0_0_12px_rgba(244,191,79,0.6)] relative overflow-hidden group"
        >
           <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 rounded-full" />
        </button>
        <button
          onClick={() => appWindow?.toggleMaximize()}
          className="w-3 h-3 rounded-full bg-[#61C554] hover:scale-110 active:scale-95 transition-all shadow-[0_0_8px_rgba(97,197,84,0.3)] hover:shadow-[0_0_12px_rgba(97,197,84,0.6)] relative overflow-hidden group"
        >
           <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 rounded-full" />
        </button>
      </div>

      {/* Center: Title & Dynamic Hardware Status */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-center gap-3 w-1/3 pointer-events-none"
      >
        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 tracking-wide text-sm flex items-center gap-2">
          <Sparkle weight="fill" className="text-purple-400" />
          Upscaly
        </span>
        
        {devices.length > 0 && (
          <div className="pointer-events-auto">
             <CustomSelect 
               options={devices}
               value={selectedDevice}
               onChange={handleDeviceChange}
               placeholder="Select Device"
               width="180px"
               renderTrigger={() => (
                 <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors shadow-sm cursor-pointer group">
                   {isCpu ? <Cpu size={12} className="text-blue-400 group-hover:text-blue-300 transition-colors" /> : <Monitor size={12} className="text-emerald-400 group-hover:text-emerald-300 transition-colors" />}
                   <span className="truncate max-w-[120px]">{selectedDeviceName}</span>
                 </div>
               )}
             />
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center justify-end gap-2 w-1/3">
        <button
          onClick={onShowModelCatalog}
          className="h-7 px-3 rounded-lg flex items-center gap-2 text-xs font-medium bg-purple-500/10 text-purple-200 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/30 transition-all hover:shadow-[0_0_12px_rgba(168,85,247,0.15)]"
          title="Model Catalog"
        >
          <ListPlus size={14} weight="bold" />
          Models
        </button>
        <button
          onClick={onShowSettings}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Settings"
        >
          <Gear size={16} />
        </button>
        <button
          onClick={onShowAbout}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="About Upscaly"
        >
          <Info size={16} />
        </button>
      </div>
    </div>
  );
}

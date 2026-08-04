import React from 'react';
import { X, Sparkle, Keyboard, Cpu, Palette, Info } from '@phosphor-icons/react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const hotkeys = [
    { key: 'Space', desc: 'Hold to temporarily reveal Original (Before) image' },
    { key: 'S', desc: 'Toggle Comparison View Mode (Split Slider vs Side-by-Side)' },
    { key: 'Tab', desc: 'Toggle Studio Inspector Panel' },
    { key: '1 / 2 / 3', desc: 'Set Target Scale Factor (2x / 3x / 4x)' },
    { key: 'Ctrl + O', desc: 'Open File Picker' },
    { key: 'Ctrl + Enter', desc: 'Start AI Upscaling' },
    { key: 'Esc', desc: 'Cancel active upscale or close overlays' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-xl bg-[#141419] border border-[#272730] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#272730] flex items-center justify-between bg-[#181820]/60">
          <div className="flex items-center gap-2">
            <Sparkle weight="fill" className="text-indigo-400" size={18} />
            <h3 className="text-sm font-bold text-white tracking-wide">
              About Upscaly Studio
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-medium">
              v0.1.0 Studio
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181820] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* App Overview */}
          <div className="p-3.5 rounded-xl bg-[#181820] border border-[#272730] space-y-1.5">
            <p className="text-zinc-200 font-medium leading-relaxed">
              Upscaly Studio is a high-performance local AI image and video upscaling workstation powered by RealESRGAN NCNN and Vulkan GPU acceleration.
            </p>
            <p className="text-[11px] text-zinc-400">
              100% offline, private, and local execution with zero cloud dependency.
            </p>
          </div>

          {/* Studio Keyboard Shortcuts */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Keyboard size={14} className="text-indigo-400" />
              <span>Studio Keyboard Shortcuts</span>
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {hotkeys.map((h) => (
                <div
                  key={h.key}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#181820] border border-[#272730]"
                >
                  <span className="px-2 py-0.5 rounded bg-[#0F0F12] border border-[#272730] text-[11px] font-mono font-bold text-indigo-300">
                    {h.key}
                  </span>
                  <span className="text-zinc-300 text-[11px] font-medium">{h.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Model Guide */}
          <div className="space-y-2.5 pt-2 border-t border-[#272730]">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Palette size={14} className="text-indigo-400" />
              <span>Model Selection Guide</span>
            </h4>
            <div className="space-y-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-[#181820] border border-[#272730]">
                <span className="font-bold text-white block mb-0.5">&bull; Photos & Landscapes:</span>
                <span className="text-zinc-400">Use <b>RealESRGAN Ultra (4x)</b> for maximum clarity, texture recovery, and photorealistic detail.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#181820] border border-[#272730]">
                <span className="font-bold text-white block mb-0.5">&bull; Anime, Manga & 2D Illustrations:</span>
                <span className="text-zinc-400">Use <b>RealESRGAN Anime Art (4x)</b> or <b>Anime & 2D Art (2x / 3x / 4x)</b> to clean line art without artifacts.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#181820] border border-[#272730]">
                <span className="font-bold text-white block mb-0.5">&bull; Video Animation Clips:</span>
                <span className="text-zinc-400">Select the <b>Video</b> tab to automatically extract, upscale, and reassemble MP4/MKV video frames.</span>
              </div>
            </div>
          </div>

          {/* GPU Hardware Tips */}
          <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/30 flex items-start gap-2.5 text-[11px] text-indigo-300">
            <Cpu size={18} className="text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-indigo-200">GPU VRAM & Tile Size Tip</span>
              <span>If upscaling very large 4K/8K images, open the <b>Studio Inspector</b> (`Tab`) and click <b>Auto-Calculate Safe Tile Size</b> to prevent GPU memory allocation errors.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#272730] flex items-center justify-between bg-[#181820]/60 text-[11px] text-zinc-400 font-mono">
          <div className="flex items-center gap-1.5">
            <Info size={13} className="text-indigo-400" />
            <span>Upscaly Studio</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-semibold text-xs transition-colors cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

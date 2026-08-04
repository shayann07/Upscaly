import { motion } from "framer-motion";

interface AboutModalProps {
  onClose: () => void;
  isOpen?: boolean;
}

const HOTKEYS = [
  { key: "SPACE", desc: "Hold to reveal the source frame" },
  { key: "S", desc: "Switch split slider / side-by-side" },
  { key: "TAB", desc: "Toggle the settings panel" },
  { key: "1 2 3", desc: "Set scale to 2×, 3× or 4×" },
  { key: "⌘ O", desc: "Add files to the queue" },
  { key: "⌘ ↩", desc: "Run the queue" },
  { key: "ESC", desc: "Cancel job or close overlays" },
];

export function AboutModal({ onClose, isOpen = true }: AboutModalProps) {
  if (isOpen === false) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="absolute inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-[100] p-10"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.955 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.955 }}
        transition={{ duration: 0.28, ease: [0.22, 1.3, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] border border-[var(--border-subtle)] rounded-2xl overflow-hidden bg-[var(--bg-surface)] shadow-[var(--shadow-modal)]"
      >
        {/* Header */}
        <div className="px-5 pt-[18px] pb-4 border-b border-[var(--border-default)]">
          <div className="flex items-start justify-between gap-3.5 mb-2">
            <span className="font-['Martian_Mono',monospace] text-[9.5px] text-[var(--text-dim)] tracking-[0.09em]">
              REAL-ESRGAN NCNN · VULKAN
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex-none flex items-center justify-center border-none rounded-[7px] bg-transparent text-[var(--text-muted)] text-[15px] leading-none cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ×
            </button>
          </div>
          <div className="text-[12.5px] text-[var(--text-tertiary)] leading-[1.6]">
            Local image and video upscaling on Vulkan. No account, no network calls, no telemetry — media never leaves the machine.
          </div>
        </div>

        {/* Shortcuts */}
        <div className="px-5 pt-4 pb-5">
          <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.1em] text-[var(--text-dim)] mb-[9px]">
            SHORTCUTS
          </div>
          {HOTKEYS.map((k) => (
            <div key={k.key} className="flex items-center gap-3.5 py-2 border-t border-[var(--border-default)]">
              <span className="w-24 flex-none font-['Martian_Mono',monospace] text-[10px] text-[#EDEAE6] tracking-[0.02em]">
                {k.key}
              </span>
              <span className="flex-1 text-xs text-[var(--text-tertiary)]">{k.desc}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default AboutModal;

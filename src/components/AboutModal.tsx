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
    <div className="w-full h-full flex flex-col border border-[#34312D] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[0_20px_50px_rgba(0,0,0,.6)] overflow-hidden">
      {/* Header */}
      <div className="flex-none h-[38px] flex items-center justify-between px-3 border-b border-[#232120]">
        <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[#6B655E]">SHORTCUTS & INFO</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center border-none rounded-md bg-transparent text-[#6B655E] text-sm cursor-pointer transition-all duration-150 hover:bg-[#1C1B19] hover:text-[#F2F0ED]"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        <div className="text-[11.5px] text-[var(--text-tertiary)] leading-[1.6] mb-3 pb-3 border-b border-[#232120]">
          Local image and video upscaling on Vulkan. No account, no network calls, no telemetry — media never leaves the machine.
        </div>

        <div className="font-['Martian_Mono',monospace] text-[8.5px] tracking-[0.1em] text-[#6B655E] mb-2">
          SHORTCUTS
        </div>
        <div className="space-y-1">
          {HOTKEYS.map((k) => (
            <div key={k.key} className="flex items-center gap-2 py-1.5 px-2 rounded-lg border border-transparent transition-all duration-200 hover:scale-[1.02] hover:bg-[#1C1B19] hover:border-[var(--border-hover)]">
              <span className="w-16 flex-none font-['Martian_Mono',monospace] text-[9.5px] text-[#EDEAE6] tracking-[0.02em]">
                {k.key}
              </span>
              <span className="flex-1 text-[11px] text-[var(--text-tertiary)]">{k.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AboutModal;

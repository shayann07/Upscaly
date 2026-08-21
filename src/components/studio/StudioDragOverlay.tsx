import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StudioDragOverlayProps {
  isDragOver: boolean;
  accentColor?: string;
}

export const StudioDragOverlay = memo(function StudioDragOverlay({
  isDragOver,
  accentColor = 'var(--accent)',
}: StudioDragOverlayProps) {
  return (
    <AnimatePresence>
      {isDragOver && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center p-6 bg-[rgba(9,8,7,0.8)] backdrop-blur-md"
        >
          {/* Ambient background rotating halo glow */}
          <div
            className="absolute w-80 h-80 rounded-full opacity-35 blur-3xl pointer-events-none animate-halo-rotate"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(168,11,36,0.65), rgba(232,138,128,0.35), transparent, rgba(168,11,36,0.65))',
            }}
          />

          {/* Refined Glassmorphic Card */}
          <div
            className="relative w-full h-full max-w-[500px] max-h-[320px] rounded-2xl border flex flex-col items-center justify-center text-center p-8 bg-[rgba(13,12,11,0.96)] shadow-[0_24px_64px_rgba(0,0,0,0.7),0_0_40px_rgba(168,11,36,0.2)] overflow-hidden"
            style={{
              borderColor: accentColor,
            }}
          >
            {/* Upscaly Signature Pixel Grid Resolution Stepper */}
            <div className="flex items-end gap-[10px] mb-5">
              <div className="w-[22px] h-[22px] rounded-[3px] border border-[var(--border-subtle)] bg-[#26221E]" />
              <div
                className="w-8 h-8 rounded-[3px] border border-[#3A352F]"
                style={{
                  background:
                    'linear-gradient(#0B0A09 1px, transparent 1px) 0 0/100% 16px, linear-gradient(90deg, #0B0A09 1px, transparent 1px) 0 0/16px 100%, #312C27',
                }}
              />
              <div
                className="w-[46px] h-[46px] rounded-[4px] shadow-[0_0_20px_rgba(168,11,36,0.3)]"
                style={{
                  border: `1px solid ${accentColor}`,
                  background:
                    'linear-gradient(#0B0A09 1px, transparent 1px) 0 0/100% 8px, linear-gradient(90deg, #0B0A09 1px, transparent 1px) 0 0/8px 100%, #443E37',
                }}
              />
            </div>

            <div className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] mb-2 font-['Archivo',sans-serif]">
              Release to queue
            </div>

            <div className="text-[12.5px] text-[var(--text-tertiary)] leading-[1.5] max-w-[320px] mb-3">
              Images or video, a single file or a whole folder. Nothing leaves your machine.
            </div>

            <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.07em] text-[var(--text-ghost)]">
              PNG JPG WEBP &nbsp;·&nbsp; MP4 MKV MOV
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default StudioDragOverlay;

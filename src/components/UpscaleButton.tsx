import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Play, Sparkle } from '@phosphor-icons/react';

interface UpscaleButtonProps {
  disabled: boolean;
  onClick: () => void;
  isProcessing: boolean;
}

export const UpscaleButton: React.FC<UpscaleButtonProps> = ({
  disabled,
  onClick,
  isProcessing,
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Magnetic Pull Coordinates
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 15, stiffness: 150 };
  const dx = useSpring(x, springConfig);
  const dy = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current || disabled) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distanceX = e.clientX - centerX;
    const distanceY = e.clientY - centerY;

    if (Math.abs(distanceX) < 100 && Math.abs(distanceY) < 100) {
      x.set(distanceX * 0.2);
      y.set(distanceY * 0.2);
    }
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={buttonRef}
      style={{
        x: dx,
        y: dy,
        boxShadow: disabled
          ? 'none'
          : '0 12px 35px -5px rgba(168, 85, 247, 0.45), 0 0 25px rgba(241, 254, 200, 0.3)',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      disabled={disabled || isProcessing}
      onClick={onClick}
      className={`w-full relative py-4 px-6 rounded-3xl font-extrabold text-sm tracking-wider select-none transition-all duration-300 flex items-center justify-center gap-2.5 overflow-hidden ${
        disabled
          ? 'bg-[#23212C]/60 text-[#D2C3F6]/30 border border-white/5 cursor-not-allowed'
          : 'bg-gradient-to-r from-[#F1FEC8] via-[#D2C3F6] to-[#A855F7] text-[#16141D] border border-white/50 hover:scale-[1.02] active:scale-[0.98] animate-shimmer cursor-pointer'
      }`}
    >
      {/* Specular Edge Glow Overlay */}
      {!disabled && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
      )}

      {isProcessing ? (
        <Sparkle size={20} weight="fill" className="text-[#16141D] animate-spin" />
      ) : (
        <Play size={20} weight="fill" className={disabled ? 'text-[#D2C3F6]/30' : 'text-[#16141D] drop-shadow'} />
      )}
      <span className="drop-shadow-sm">{isProcessing ? 'Processing Upscale...' : 'Upscale Media'}</span>
    </motion.button>
  );
};

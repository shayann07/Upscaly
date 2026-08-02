import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Play } from '@phosphor-icons/react';

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

    // Pull within 30px magnetic radius
    if (Math.abs(distanceX) < 80 && Math.abs(distanceY) < 80) {
      x.set(distanceX * 0.25);
      y.set(distanceY * 0.25);
    }
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={buttonRef}
      style={{ x: dx, y: dy }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      disabled={disabled || isProcessing}
      onClick={onClick}
      className={`w-full relative py-4 px-6 rounded-2xl font-bold text-sm tracking-wide select-none transition-all duration-200 flex items-center justify-center gap-2 shadow-xl ${
        disabled
          ? 'bg-[#23212C] text-[#D2C3F6]/30 border border-white/5 cursor-not-allowed'
          : 'bg-gradient-to-r from-[#F1FEC8] via-[#E2FBB1] to-[#D2C3F6] text-[#16141D] border border-white/40 hover:scale-[1.02] active:scale-[0.98] shadow-[#F1FEC8]/20 animate-shimmer cursor-pointer'
      }`}
    >
      <Play size={18} weight="fill" className={disabled ? 'text-[#D2C3F6]/30' : 'text-[#16141D]'} />
      <span>{isProcessing ? 'Processing Upscale...' : 'Upscale Media'}</span>
    </motion.button>
  );
};

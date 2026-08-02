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
          : '0 12px 35px -5px rgba(168, 85, 247, 0.45), 0 0 20px rgba(52, 211, 153, 0.3)',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      disabled={disabled || isProcessing}
      onClick={onClick}
      className={`w-full relative py-4 px-6 rounded-2xl font-extrabold text-sm tracking-widest uppercase select-none transition-all duration-500 flex items-center justify-center gap-2.5 overflow-hidden ${
        disabled
          ? 'bg-black/40 text-white/20 border border-white/5 cursor-not-allowed'
          : 'bg-gradient-to-r from-purple-600 via-emerald-500 to-purple-600 text-white border border-white/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
      }`}
    >
      {/* Dynamic Animated Gradient Background */}
      {!disabled && (
        <div 
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(168,85,247,1)_0%,rgba(52,211,153,1)_50%,rgba(168,85,247,1)_100%)] bg-[length:200%_auto] animate-shimmer pointer-events-none opacity-80"
          style={{ mixBlendMode: 'overlay' }}
        />
      )}

      {/* Specular Edge Glow Overlay */}
      {!disabled && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent pointer-events-none mix-blend-overlay" />
      )}

      {isProcessing ? (
        <Sparkle size={20} weight="fill" className="text-white animate-spin z-10 relative" />
      ) : (
        <Play size={20} weight="fill" className={`z-10 relative ${disabled ? 'text-white/20' : 'text-white drop-shadow-md'}`} />
      )}
      <span className="z-10 relative drop-shadow-md">
        {isProcessing ? 'Processing Upscale...' : 'Upscale Media'}
      </span>
    </motion.button>
  );
};

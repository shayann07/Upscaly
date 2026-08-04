import React from 'react';
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
  return (
    <button
      type="button"
      disabled={disabled || isProcessing}
      onClick={onClick}
      className={`h-[42px] px-6 rounded-xl font-semibold text-xs tracking-wide select-none transition-all flex items-center justify-center gap-2 border ${
        disabled
          ? 'bg-[#181820] text-zinc-600 border-[#272730] cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/50 shadow-sm active:scale-98 cursor-pointer'
      }`}
    >
      {isProcessing ? (
        <Sparkle size={16} weight="fill" className="text-white animate-spin" />
      ) : (
        <Play size={15} weight="fill" className={disabled ? 'text-zinc-600' : 'text-white'} />
      )}
      <span>
        {isProcessing ? 'Processing...' : 'Upscale Media'}
      </span>
    </button>
  );
};

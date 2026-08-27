import React from 'react';
import { Play, Sparkle } from '@phosphor-icons/react';
import { STRINGS } from '../lib/strings';

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
  const isButtonDisabled = disabled || isProcessing;

  return (
    <button
      type="button"
      disabled={isButtonDisabled}
      onClick={onClick}
      className="h-[42px] px-6 font-semibold text-xs tracking-wide select-none transition-all flex items-center justify-center gap-2 border active:scale-[0.98]"
      style={{
        borderRadius: 'var(--radius-xl)',
        background: isButtonDisabled ? 'var(--bg-elevated)' : 'var(--accent)',
        color: isButtonDisabled ? 'var(--text-ghost)' : 'var(--text-primary)',
        borderColor: isButtonDisabled ? 'var(--border-default)' : 'var(--border-subtle)',
        cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
        boxShadow: isButtonDisabled ? 'none' : 'var(--shadow-pill)',
      }}
    >
      {isProcessing ? (
        <Sparkle
          size={16}
          weight="fill"
          className="animate-spin"
          style={{ color: 'var(--text-primary)' }}
        />
      ) : (
        <Play
          size={15}
          weight="fill"
          style={{ color: disabled ? 'var(--text-ghost)' : 'var(--text-primary)' }}
        />
      )}
      <span>{isProcessing ? STRINGS.PROCESSING : STRINGS.UPSCALE_MEDIA}</span>
    </button>
  );
};

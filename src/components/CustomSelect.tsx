import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, Check } from '@phosphor-icons/react';
import { STRINGS } from '../lib/strings';

export interface SelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string | number;
  onChange: (val: string | number) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  width?: string;
  renderTrigger?: () => React.ReactNode;
  dropDirection?: 'down' | 'up';
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = STRINGS.SELECT_OPTION,
  icon,
  className = '',
  width = '100%',
  renderTrigger,
  dropDirection = 'down',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isUp = dropDirection === 'up';

  return (
    <div ref={containerRef} className={`relative select-none ${className}`} style={{ width }}>
      {/* Select Trigger Button */}
      {renderTrigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{renderTrigger()}</div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 hover:scale-[1.02] cursor-pointer group"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {icon && (
              <span className="transition-colors" style={{ color: 'var(--text-secondary)' }}>
                {icon}
              </span>
            )}
            <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          </div>
          <CaretDown
            size={14}
            className={`transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            style={{ color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          />
        </button>
      )}

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: isUp ? 4 : -4 }}
            animate={{ opacity: 1, y: isUp ? -4 : 4 }}
            exit={{ opacity: 0, y: isUp ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-0 min-w-[320px] max-w-[380px] z-50 max-h-64 overflow-y-auto rounded-xl border shadow-2xl p-1.5 space-y-1 ${
              isUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-default)',
            }}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                {STRINGS.NO_OPTIONS}
              </div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    title={opt.sublabel ? `${opt.label} — ${opt.sublabel}` : opt.label}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className="group/opt w-full flex items-start justify-between gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-all cursor-pointer border"
                    style={{
                      background: isSelected ? 'var(--accent-bg)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      borderColor: isSelected ? 'var(--accent)' : 'transparent',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {opt.icon && <span className="shrink-0 mt-0.5">{opt.icon}</span>}
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-semibold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {opt.label}
                        </p>
                        {opt.sublabel && (
                          <p
                            className="text-[11px] font-normal mt-0.5 leading-snug transition-all line-clamp-1 group-hover/opt:line-clamp-none"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {opt.sublabel}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        className="shrink-0 mt-0.5"
                        weight="bold"
                        style={{ color: 'var(--accent)' }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, Check } from '@phosphor-icons/react';

export interface SelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string | number;
  onChange: (val: any) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  width?: string;
  renderTrigger?: () => React.ReactNode;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  icon,
  className = '',
  width = '100%',
  renderTrigger,
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

  return (
    <div ref={containerRef} className={`relative select-none ${className}`} style={{ width }}>
      {/* Select Trigger Pill Button */}
      {renderTrigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{renderTrigger()}</div>
      ) : (
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#23212C]/80 hover:bg-[#36255C]/50 border border-[#D2C3F6]/20 hover:border-[#D2C3F6]/40 text-xs font-semibold text-[#F1FEC8] backdrop-blur-xl shadow-lg transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-[#D2C3F6] group-hover:text-[#F1FEC8] transition-colors">{icon}</span>}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <CaretDown
          size={14}
          className={`text-[#D2C3F6] transition-transform duration-300 shrink-0 ${
            isOpen ? 'rotate-180 text-[#F1FEC8]' : ''
          }`}
        />
      </button>
      )}

      {/* Animated Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-2xl bg-[#1D1B26]/95 border border-[#D2C3F6]/30 backdrop-blur-2xl shadow-2xl p-1.5 space-y-1 divide-y divide-white/5"
            style={{
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(210, 195, 246, 0.15)',
            }}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[#D2C3F6]/50">No options available</div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#36255C] to-[#4A3078] text-[#F1FEC8] font-bold shadow-md border border-[#D2C3F6]/30'
                        : 'text-[#D2C3F6]/80 hover:bg-[#36255C]/40 hover:text-[#F1FEC8]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <div className="min-w-0">
                        <p className="truncate">{opt.label}</p>
                        {opt.sublabel && (
                          <p className="text-[10px] text-[#D2C3F6]/50 font-mono truncate">{opt.sublabel}</p>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-[#F1FEC8] shrink-0" weight="bold" />}
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

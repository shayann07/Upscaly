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
  dropDirection?: 'down' | 'up';
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
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#181820] hover:bg-[#22222B] border border-[#272730] hover:border-[var(--border-hover)] text-xs font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-[var(--shadow-pill-hover)] cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {icon && <span className="text-zinc-400 group-hover:text-zinc-300 transition-colors">{icon}</span>}
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          <CaretDown
            size={14}
            className={`text-zinc-400 transition-transform duration-200 shrink-0 ${
              isOpen ? 'rotate-180 text-white' : ''
            }`}
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
            className={`absolute left-0 min-w-[320px] max-w-[380px] z-50 max-h-64 overflow-y-auto rounded-xl bg-[#141419] border border-[#272730] shadow-2xl p-1.5 space-y-1 ${
              isUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-zinc-500">No options available</div>
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
                    className={`group/opt w-full flex items-start justify-between gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/40'
                        : 'text-zinc-300 hover:bg-[#22222B] hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {opt.icon && <span className="shrink-0 mt-0.5">{opt.icon}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white truncate">{opt.label}</p>
                        {opt.sublabel && (
                          <p className="text-[11px] text-zinc-400 group-hover/opt:text-zinc-100 font-normal mt-0.5 leading-snug transition-all line-clamp-1 group-hover/opt:line-clamp-none">
                            {opt.sublabel}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-indigo-400 shrink-0 mt-0.5" weight="bold" />}
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

import { motion, AnimatePresence } from 'framer-motion';
import { Toast, MAX_VISIBLE_TOASTS } from '../lib/types';

export interface ToastItem {
  id: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  kind?: string;
  text?: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: Toast[] | ToastItem[];
  onDismiss: (id: string) => void;
  onCloseDrawer?: () => void;
  drawerOpen?: boolean;
  settingsOpen?: boolean;
}

export function ToastContainer({
  toasts,
  onDismiss,
  onCloseDrawer,
  drawerOpen,
  settingsOpen = false,
}: ToastContainerProps) {
  const isDrawerOpen = drawerOpen ?? settingsOpen;
  // The store is already capped to this length; slicing here is a safety net
  // for any other caller passing an unbounded list, not the primary bound.
  const visible = toasts.slice(-MAX_VISIBLE_TOASTS);

  const getToastColors = (type?: string, kind?: string) => {
    const k = (kind || type || '').toLowerCase();
    if (k.includes('success') || k === 'done' || k === 'complete') {
      return {
        badgeColor: '#86AE8D',
        borderColor: '#3A5A3E',
        bgColor: 'rgba(19,32,21,.97)',
      };
    }
    if (k.includes('error') || k.includes('fail') || k === 'danger') {
      return {
        badgeColor: '#E88A80',
        borderColor: '#4A211C',
        bgColor: 'rgba(26,16,14,.97)',
      };
    }
    if (k.includes('warn')) {
      return {
        badgeColor: '#E8BC80',
        borderColor: '#4A3A21',
        bgColor: 'rgba(26,22,14,.97)',
      };
    }
    // Info / default
    return {
      badgeColor: '#A80B24',
      borderColor: '#34312D',
      bgColor: 'rgba(13,12,11,.97)',
    };
  };

  return (
    <motion.div
      layout="position"
      data-toast-container="true"
      className={`absolute bottom-[132px] flex flex-col gap-2 z-[90] w-[320px] pointer-events-none ${
        isDrawerOpen ? 'left-[20px] right-auto items-start' : 'right-[14px] left-auto items-end'
      }`}
      transition={{
        type: 'spring',
        stiffness: 340,
        damping: 32,
        mass: 0.8,
      }}
    >
      <AnimatePresence mode="popLayout">
        {visible.map((t) => {
          const kind = t.kind || (t.type ? t.type.toUpperCase() : 'INFO');
          const text = t.text || t.message || '';
          const colors = getToastColors(t.type, t.kind);

          return (
            <motion.div
              layout
              key={t.id}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{
                opacity: 0,
                x: isDrawerOpen ? -28 : 28,
                scale: 0.95,
                transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
                mass: 0.7,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="group w-full flex gap-[11px] pointer-events-auto max-h-[72px] overflow-hidden hover:max-h-[300px] shadow-[var(--shadow-toast)] hover:border-[var(--border-hover)] select-none"
              style={{
                padding: '12px 13px',
                border: `1px solid ${colors.borderColor}`,
                borderRadius: 12,
                background: colors.bgColor,
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="font-['Martian_Mono',monospace] text-[9.5px] font-bold tracking-[0.08em] mb-[3px]"
                  style={{ color: colors.badgeColor }}
                >
                  {kind}
                </div>
                <div className="text-[11.5px] text-[#EDEAE6] leading-[1.45] font-medium line-clamp-2 group-hover:line-clamp-none group-hover:whitespace-normal group-hover:overflow-visible transition-[line-clamp] duration-300">
                  {text}
                </div>
              </div>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(t.id);
                  if (isDrawerOpen) {
                    onCloseDrawer?.();
                  }
                }}
                className="w-5 h-5 -mr-1 -mt-1 flex-none rounded-full border-none bg-transparent flex items-center justify-center text-[var(--text-muted)] text-[14px] leading-none cursor-pointer pointer-events-auto transition-colors hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.08)]"
              >
                ×
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}

export default ToastContainer;

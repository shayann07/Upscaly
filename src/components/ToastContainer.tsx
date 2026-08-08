import { Toast } from "../lib/types";

export interface ToastItem {
  id: string;
  type?: "success" | "error" | "info" | "warning";
  kind?: string;
  text?: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: Toast[] | ToastItem[];
  onDismiss: (id: string) => void;
  settingsOpen?: boolean;
}

export function ToastContainer({ toasts, onDismiss, settingsOpen = false }: ToastContainerProps) {
  const EASE = "var(--ease-spring)";
  const visible = toasts.slice(-3);

  const getToastColors = (type?: string, kind?: string) => {
    const k = (kind || type || "").toLowerCase();
    if (k.includes("success") || k === "done" || k === "complete") {
      return {
        badgeColor: "#86AE8D",
        borderColor: "#3A5A3E",
        bgColor: "rgba(19,32,21,.97)",
      };
    }
    if (k.includes("error") || k.includes("fail") || k === "danger") {
      return {
        badgeColor: "#E88A80",
        borderColor: "#4A211C",
        bgColor: "rgba(26,16,14,.97)",
      };
    }
    if (k.includes("warn")) {
      return {
        badgeColor: "#E8BC80",
        borderColor: "#4A3A21",
        bgColor: "rgba(26,22,14,.97)",
      };
    }
    // Info / default
    return {
      badgeColor: "#A80B24",
      borderColor: "#34312D",
      bgColor: "rgba(13,12,11,.97)",
    };
  };

  return (
    <div
      className="absolute bottom-[132px] flex flex-col gap-2 z-[90] w-[310px] pointer-events-none"
      style={{
        right: settingsOpen ? 336 : 12,
        transition: `right .28s ${EASE}`,
      }}
    >
      {visible.map((t) => {
        const kind = t.kind || (t.type ? t.type.toUpperCase() : "INFO");
        const text = t.text || t.message || "";
        const colors = getToastColors(t.type, t.kind);

        return (
          <div
            key={t.id}
            className="group flex gap-[11px] pointer-events-auto transition-all duration-300 max-h-[72px] overflow-hidden hover:max-h-[400px] hover:w-[360px] hover:-ml-[50px] shadow-[var(--shadow-toast)] hover:scale-[1.03] hover:border-[var(--border-hover)]"
            style={{
              padding: "12px 13px",
              border: `1px solid ${colors.borderColor}`,
              borderRadius: 12,
              background: colors.bgColor,
              animation: `toastin .32s ${EASE} both`,
              transition: `max-height .3s ${EASE}, width .3s ${EASE}, margin-left .3s ${EASE}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <div
                className="font-['Martian_Mono',monospace] text-[9.5px] font-bold tracking-[0.08em] mb-[3px]"
                style={{ color: colors.badgeColor }}
              >
                {kind}
              </div>
              <div className="text-[11.5px] text-[#EDEAE6] leading-[1.45] font-medium transition-all duration-200 line-clamp-2 group-hover:line-clamp-none group-hover:whitespace-normal group-hover:overflow-visible">
                {text}
              </div>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="w-[18px] h-[18px] flex-none border-none bg-transparent text-[var(--text-muted)] text-[13px] leading-none cursor-pointer pointer-events-auto transition-colors hover:text-[var(--text-primary)]"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastContainer;

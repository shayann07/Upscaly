import { GpuTelemetry } from '../../lib/ipc';

/**
 * Temperature colour thresholds, chosen for what they mean on a laptop
 * discrete GPU rather than for visual variety: NVIDIA mobile parts begin
 * thermal throttling in the high 80s, and sustained time there is the
 * regime where this machine's driver resets were observed. Amber is "warm,
 * watch it", red is "this is the territory where runs have died".
 */
const TEMP_WARN_C = 75;
const TEMP_DANGER_C = 85;

function tempColor(c: number | null): string {
  if (c == null) return 'var(--text-dim)';
  if (c >= TEMP_DANGER_C) return '#E88A80';
  if (c >= TEMP_WARN_C) return '#E8B980';
  return 'var(--text-primary)';
}

/** One labelled figure, same dim-label/bold-value grammar as the progress bar. */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-['Martian_Mono',monospace] text-[8px] tracking-[0.08em] text-[var(--text-dim)]">
        {label}
      </span>
      <span
        className="font-['Martian_Mono',monospace] text-[10px] font-semibold"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * The live readings segment of the file chip during a run.
 *
 * Absent readings render as an em-dash, never as an invented number -- on
 * machines without NVIDIA tooling the whole component is simply not
 * rendered (the hook returns null), so this only ever formats a reading
 * that at least partially exists.
 */
export function GpuTelemetryReadout({ telemetry }: { telemetry: GpuTelemetry }) {
  const vram =
    telemetry.memory_used_mb != null && telemetry.memory_total_mb != null
      ? `${(telemetry.memory_used_mb / 1024).toFixed(1)}/${(telemetry.memory_total_mb / 1024).toFixed(1)}G`
      : '—';

  return (
    <span className="flex items-center gap-2.5 pl-2.5 border-l border-[var(--border-default)]">
      <Stat
        label="TEMP"
        value={telemetry.temperature_c == null ? '—' : `${telemetry.temperature_c}°`}
        color={tempColor(telemetry.temperature_c)}
      />
      <Stat
        label="GPU"
        value={telemetry.utilization_pct == null ? '—' : `${telemetry.utilization_pct}%`}
      />
      <Stat label="VRAM" value={vram} />
    </span>
  );
}

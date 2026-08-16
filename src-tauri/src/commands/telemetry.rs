//! Live GPU readings for the title bar during a run.
//!
//! NVIDIA-only, via `nvidia-smi` -- the one vendor tool reliably present
//! wherever the driver is. There is no equivalent query surface for the
//! Intel iGPU, so on machines without an NVIDIA card every field comes back
//! `None` and the UI shows nothing rather than a number it invented.
//!
//! Every field is optional individually, because partial availability is
//! the *normal* case, not an edge: on laptops the fan is controlled by the
//! EC, not the GPU driver, so `fan.speed` reads `[N/A]` on most machines
//! that will ever run this. Temperature and utilization almost always
//! report; fan frequently does not. The UI renders an absent value as an
//! em-dash, per the project rule that unmeasured values are never
//! substituted with plausible-looking ones.

use std::process::Command;

use crate::error::AppError;

#[derive(Debug, Clone, Default, serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct GpuTelemetry {
    pub temperature_c: Option<u32>,
    pub utilization_pct: Option<u32>,
    pub memory_used_mb: Option<u32>,
    pub memory_total_mb: Option<u32>,
    pub fan_pct: Option<u32>,
    pub clock_mhz: Option<u32>,
}

/// `nvidia-smi` lives on PATH on most installs, and in System32 on the
/// rest. Checked in that order; absence means "no NVIDIA telemetry", which
/// is a valid answer rather than an error.
fn nvidia_smi_candidates() -> [&'static str; 2] {
    ["nvidia-smi", r"C:\Windows\System32\nvidia-smi.exe"]
}

fn parse_field(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains("N/A") {
        return None;
    }
    // Values here are temperatures, percentages, megabytes and megahertz --
    // all comfortably inside u32, and a negative or absurd reading is a
    // sensor error better reported as absent than as a wrapped number. The
    // explicit range check is what makes the cast below lossless.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    trimmed
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && (0.0..=f64::from(u32::MAX)).contains(v))
        .map(|v| v.round() as u32)
}

/// One CSV line of numbers into a telemetry reading.
fn parse_telemetry(line: &str) -> GpuTelemetry {
    let mut fields = line.split(',');
    let mut next = || fields.next().and_then(parse_field);
    GpuTelemetry {
        temperature_c: next(),
        utilization_pct: next(),
        memory_used_mb: next(),
        memory_total_mb: next(),
        fan_pct: next(),
        clock_mhz: next(),
    }
}

/// Current readings from the first NVIDIA GPU, all-`None` when there is no
/// NVIDIA tooling to ask.
///
/// Runs as an async command so it executes on Tauri's pool rather than the
/// job worker thread -- a wedged driver stalls this one poll, not the
/// upscale. `nvidia-smi` completes in tens of milliseconds when healthy.
#[tauri::command]
pub async fn get_gpu_telemetry() -> Result<GpuTelemetry, AppError> {
    for bin in nvidia_smi_candidates() {
        let mut cmd = Command::new(bin);
        cmd.args([
            "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,fan.speed,clocks.sm",
            "--format=csv,noheader,nounits",
        ]);
        crate::process_runner::suppress_console_window(&mut cmd);

        let Ok(output) = cmd.output() else {
            continue; // binary not found at this candidate; try the next
        };
        if !output.status.success() {
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().find(|l| !l.trim().is_empty()) {
            return Ok(parse_telemetry(line));
        }
    }
    Ok(GpuTelemetry::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parses_a_healthy_reading() {
        let t = parse_telemetry("62, 97, 3182, 6144, 45, 1702");
        assert_eq!(t.temperature_c, Some(62));
        assert_eq!(t.utilization_pct, Some(97));
        assert_eq!(t.memory_used_mb, Some(3182));
        assert_eq!(t.memory_total_mb, Some(6144));
        assert_eq!(t.fan_pct, Some(45));
        assert_eq!(t.clock_mhz, Some(1702));
    }

    #[test]
    fn test_laptop_fan_reads_as_absent_not_zero() {
        // The common case on the machines this feature was built for: the
        // EC owns the fan and nvidia-smi reports [N/A]. Zero would claim
        // "fan stopped", which on a GPU at 62C under load is alarming
        // misinformation; None renders as an em-dash.
        let t = parse_telemetry("62, 97, 3182, 6144, [N/A], 1702");
        assert_eq!(t.fan_pct, None);
        assert_eq!(t.temperature_c, Some(62));
        assert_eq!(t.clock_mhz, Some(1702));
    }

    #[test]
    fn test_garbage_yields_nones_not_numbers() {
        let t = parse_telemetry("ERR!, , [Unknown Error]");
        assert_eq!(t.temperature_c, None);
        assert_eq!(t.utilization_pct, None);
        assert_eq!(t.memory_used_mb, None);
        // Short line: fields past the end are absent too.
        assert_eq!(t.clock_mhz, None);
    }
}

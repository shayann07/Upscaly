---
phase: 9
level: 1
researched_at: 2026-08-09
---

# Phase 9 Research: Decompose Video Pipeline

## Questions Investigated
1. **How to decompose the 405-line `run_video_job` function into structured phase submodules?**
   - Create `src-tauri/src/video_pipeline/` directory with:
     - `context.rs`: `VideoJobContext` struct holding `app_handle`, `job`, `temp_dir`, `cancel_requested`, and `process_handle`.
     - `encoder.rs`: `EncoderStrategy` enum and fallback reassembly runner.
     - `phases.rs`: Separate functions for `extract_frames`, `upscale_frames`, and `reassemble_video`.
     - `mod.rs`: Clean public interface re-exporting `run_video_job`, `resolve_ffmpeg_binary`, and `resolve_ffprobe_binary`.

2. **How to eliminate panicking `.to_str().unwrap()` calls?**
   - Replace `.to_str().unwrap()` with `to_string_lossy()` or return a descriptive `AppError` when a path contains invalid UTF-8 bytes.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Submodule Directory | `src-tauri/src/video_pipeline/` | Clean Rust module structure matching Phase 7 (`commands/`) and Phase 10 (`engine/`) |
| Context Struct | `VideoJobContext` | Bundles process handles, cancellation state, and temporary scratch directory guards cleanly |
| Encoder Fallback Struct | `EncoderStrategy` | Explicit metadata for tracking hardware vs software encoder selection |

## Verification Strategy
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm.cmd run check:rust` / `cargo fmt --check`
- `npm.cmd run check:ts` (ensure TypeScript IPC interop remains 100% compliant)

---
phase: 7
level: 1
researched_at: 2026-08-09
---

# Phase 7 Research: Modularize Rust Tauri Command Registration

## Questions Investigated
1. **How to organize Tauri commands into submodules without changing frontend IPC names?**
   - In Tauri 2.0, command names registered with `tauri::generate_handler![...]` default to the function identifier (e.g., `list_gpus`, `run_upscale`, `get_app_settings`).
   - Re-exporting command functions from a module (e.g. `pub use commands::gpu::*;`) or listing module paths in `generate_handler![commands::gpu::list_gpus, ...]` preserves exact string IPC bindings in frontend calls without modifying frontend `invoke('list_gpus')` names.

2. **How to resolve Clippy parameter count warnings (`clippy::too_many_arguments`) on upscale functions?**
   - `upscale_image` currently takes 9 arguments (`app_handle`, `input_path`, `output_path`, `model_name`, `gpu_id`, `scale`, `tile_size`, `is_video`, `custom_job_id`).
   - Grouping arguments into the existing `UpscaleRequest` struct or internal helper struct reduces positional parameters to 1–2, satisfying Clippy `-D warnings`.

3. **How should `commands/mod.rs` be structured?**
   - `src-tauri/src/commands/mod.rs` will declare:
     - `pub mod gpu;`
     - `pub mod settings;`
     - `pub mod models;`
     - `pub mod files;`
     - `pub mod diagnostics;`
     - `pub mod upscale;`
   - Each submodule exposes `#[tauri::command]` functions, and `mod.rs` can re-export them or `lib.rs` can reference them cleanly.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Command module directory | `src-tauri/src/commands/` | Clear standard Rust module structure |
| Parameter refactoring | Refactor `upscale_image` to accept `UpscaleRequest` | Eliminates `too_many_arguments` Clippy warning without changing Tauri IPC interface |
| Submodule division | 6 domain submodules (`gpu`, `settings`, `models`, `files`, `diagnostics`, `upscale`) | Groups related IPC commands logically and keeps each file < 150 lines |

## Verification Strategy
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm.cmd run check:ts` (ensure TypeScript & IPC bindings match)
- `npm.cmd run test` (ensure Vitest tests pass)

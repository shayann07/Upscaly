# GSD Project State

> Codebase Mapping completed on 2026-08-14

## Current Status
- **Project**: `Upscaly` (Desktop AI Image & Video Upscaler)
- **Status**: Codebase mapped and documented for planning context.

## Last Session Summary
Codebase mapping complete:
- **40 Frontend Components** identified across modular directory trees (`src/components/studio/`, `batch/`, `comparison/`, `settings/`, `titlebar/`, root).
- **15 Custom Hooks** mapped (`src/hooks/`) handling UI state, batch queuing, audio, comparisons, and Tauri IPC lifecycle.
- **8 Core Utility Modules** mapped (`src/lib/`) covering types, state machine, audio chimes, output naming, and models.
- **21 Backend Modules** analyzed (`src-tauri/src/`) covering commands, engine, video pipeline, JobObjects sandboxing, and job queue.
- **41 Dependencies** analyzed across `package.json` (10 prod, 15 dev) and `Cargo.toml` (16 crates).
- **4 Technical Debt items** surfaced (4 ESLint warnings, 1 Clippy warning in `phases.rs:222`, Prettier/rustfmt formatting drift, 8 outdated packages).

## Architecture & Planning Documents
- [SPEC.md](file:///d:/Work/Extras/image%20upscaler/.gsd/SPEC.md)
- [ROADMAP.md](file:///d:/Work/Extras/image%20upscaler/.gsd/ROADMAP.md)
- [ARCHITECTURE.md](file:///d:/Work/Extras/image%20upscaler/.gsd/ARCHITECTURE.md)
- [STACK.md](file:///d:/Work/Extras/image%20upscaler/.gsd/STACK.md)
- [STATE.md](file:///d:/Work/Extras/image%20upscaler/.gsd/STATE.md)

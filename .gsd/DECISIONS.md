# DECISIONS.md — Architecture Decision Record (ADR)

> **Project**: Upscaly v1.0

| ID | Date | Decision | Rationale |
|----|------|----------|-----------|
| ADR-01 | 2026-08-02 | Windows Job Objects for Sidecar Safety | Guarantees automatic process tree termination on app crash or force close. |
| ADR-02 | 2026-08-02 | Async GPU Scan + Cache | Eliminates UI freeze on startup by caching GPU list with driver hash validation. |
| ADR-03 | 2026-08-02 | Liquid Dark Theme (`Cosmic` / `Violet` / `Lavender` / `Vanilla`) | Premium, modern aesthetic based on user-selected color palette cards. |
| ADR-04 | 2026-08-02 | GitHub Releases for Remote Models | Allows model updates without custom server infrastructure via GitHub REST API. |
| ADR-05 | 2026-08-02 | `Arc<RwLock<AppState>>` Concurrent Lock-Free Access | Replaces static Mutex variables with lock-free concurrency primitives. |

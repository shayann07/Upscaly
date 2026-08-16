---
phase: 1
level: 2
researched_at: 2026-08-03
---

# Phase 1 Research: Async Rust Core & Sidecar Safety

## Questions Investigated

1. **Windows Job Objects & Subprocess Tree Auto-Kill**: How to guarantee zero orphan `realesrgan-ncnn-vulkan.exe` or `ffmpeg.exe` processes if the application is killed, closed, or encounters an unexpected panic?
2. **Non-Blocking GPU Discovery & Caching**: How to prevent the app from freezing on launch while probing Vulkan GPU devices?
3. **IPC Error Taxonomy & Serialization**: How to pass rich, actionable errors across the Rust → TypeScript IPC boundary using `thiserror` + `serde`?
4. **Video Pipeline RAII Cleanup**: How to ensure temporary video frames in `app_data_dir/temp_video_jobs/<job_id>` are automatically deleted on success, failure, OR job cancellation?
5. **Resumable Model Downloads**: How to implement resilient HTTP chunked model downloads from GitHub Releases with SHA-256 integrity verification?

---

## Findings

### 1. Windows Job Objects Process Tree Safety
- **Problem**: Default child process spawning (`std::process::Command` or `tokio::process::Command`) leaves orphaned sub-processes running if the parent process exits abruptly without executing `child.kill()`.
- **Solution**: On Windows, create a Win32 **Job Object** using `CreateJobObjectW` and set `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` via `SetInformationJobObject`. Assign every spawned `realesrgan-ncnn-vulkan.exe` and `ffmpeg.exe` child process handle to this Job Object. When the main Tauri process exits (for any reason), Windows automatically terminates all child processes in the Job Object tree.

### 2. Async GPU Probe with 5-Second Timeout & Cache
- **Problem**: Proving GPUs synchronously by running `realesrgan-ncnn-vulkan -v` hangs the UI for 2-5+ seconds on startup.
- **Solution**:
  1. On launch, attempt to read cached GPU list from `app_data_dir/gpu_cache.json`. If cache exists, return immediately (<10ms).
  2. Spawn async background task using `tokio::time::timeout(Duration::from_secs(5), probe_gpus_raw())`.
  3. If probe succeeds within 5s, update cache and broadcast `gpu-scan-complete` event to frontend.
  4. If probe times out, fallback gracefully to `[{ id: 0, name: "Default Vulkan GPU" }]`.

### 3. Typed Error Taxonomy (`AppError`)
- **Problem**: Returning generic `Result<T, String>` strings provides poor frontend UX and prevents contextual error recovery (e.g. suggesting lowering tile size).
- **Solution**: Implement `AppError` enum using `thiserror`:
  ```rust
  #[derive(Debug, thiserror::Error, serde::Serialize)]
  #[serde(tag = "code", content = "details")]
  pub enum AppError {
      #[error("Sidecar binary not found at '{path}'")]
      SidecarNotFound { path: String },
      #[error("Vulkan GPU initialization failed: {message}")]
      GpuError { message: String },
      #[error("Insufficient disk space on target drive: {required_mb}MB required")]
      InsufficientStorage { required_mb: u64 },
      #[error("Invalid media file format: {reason}")]
      InvalidFileFormat { reason: String },
      #[error("Network download failed: {message}")]
      NetworkError { message: String },
  }
  ```

### 4. RAII Temp Folder Cleanup Guard
- **Problem**: Manual cleanup functions in video pipelines fail if code panics or cancels early.
- **Solution**: Implement a custom RAII struct `TempFolderGuard`:
  ```rust
  pub struct TempFolderGuard(pub PathBuf);
  impl Drop for TempFolderGuard {
      fn drop(&mut self) {
          let _ = std::fs::remove_dir_all(&self.0);
      }
  }
  ```
  When the video processing job task completes, fails, or is dropped on cancellation, the `Drop` implementation automatically deletes the temporary frame directory.

### 5. Resumable HTTP Model Downloader
- **Solution**: Use `reqwest` async stream with HTTP Range headers (`Range: bytes=start-`). Download to a `.tmp` staging file, emit `download-progress` events with percentage and download speed, verify SHA-256 digest using `sha2::Sha256`, and atomically rename `.tmp` to final `.param`/`.bin` paths.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Subprocess Lifecycle | Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) | OS-level guarantee against orphan sidecar processes. |
| GPU Discovery | Disk Cache + 5s `tokio` Async Timeout | Instant app startup with zero UI freezing. |
| IPC Error Transport | `thiserror` + `serde` tagged enum | Structured JSON errors for frontend toast notifications & one-click auto-fixes. |
| Video Temp Files | RAII `TempFolderGuard` | Guarantees 0 leftover temp frames on crash or cancellation. |
| Diagnostic Logging | `tracing` + `tracing-appender` (5MB rotation) | Structured file logs in `app_data_dir/logs/upscaly.log`. |

---

## Ready for Planning
- [x] Technical questions answered
- [x] Process safety architecture defined
- [x] Error handling & IPC protocol specified
- [x] Dependencies & Win32 API interactions identified

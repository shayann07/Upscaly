---
phase: 3
level: 2
researched_at: 2026-08-03
---

# Phase 3 Research: Hardware Comparison Slider & Video Pipeline Integration

## Questions Investigated

1. **60FPS Hardware-Accelerated Split Slider**: How to achieve buttery-smooth 60fps clip-path slider dragging without layout reflows or lag when inspecting high-resolution 4K images?
2. **Zoom & Pan Controls**: How to implement hardware-accelerated 100%, 200%, and 400% zoom controls on the Before/After split slider so users can inspect fine textures?
3. **Multi-Phase Video Progress Reporting**: How to bridge Rust backend progress events (`Extracting Frames` → `Upscaling` → `Reassembling Audio`) to the React frontend?
4. **Native File Actions Integration**: How to invoke Tauri `opener` and `shell` APIs to open files directly in Windows default viewers or reveal them in File Explorer?

---

## Findings

### 1. 60FPS Clip-Path Slider Mechanics
- **CSS Strategy**: Use `clip-path: inset(0 ${100 - position}% 0 0)` on the top (After) image layer. Use `will-change: clip-path` and `transform: translate3d(0,0,0)` to ensure GPU compositing layer rendering.
- **Drag Performance**: Bind `onMouseMove` and `onTouchMove` to a `requestAnimationFrame` loop to decouple event firing from screen refresh rate.
- **Handle Feedback**: Handle pill expands (`scale: 1.15`) on active drag, and vertical laser beam divider ray brightens in `Lavender` (`#D2C3F6`).

### 2. Zoom & Pan Inspection Controls
- **Zoom Factor**: State variable `zoomLevel` (`1`, `2`, `4`).
- **CSS Transform**: `transform: scale(${zoomLevel}) translate(${panX}px, ${panY}px)`, updated via mouse wheel and drag-to-pan gestures.
- **Toggles**: Dedicated Phosphor icon buttons for `100%`, `200%`, `400%`, and `Reset Zoom`.

### 3. Video Pipeline IPC Event Streaming
- **Rust Event Struct**:
  ```rust
  #[derive(Serialize, Clone)]
  pub struct JobProgress {
      pub job_id: String,
      pub percentage: f64,
      pub status: String, // "extracting" | "processing" | "reassembling" | "completed" | "failed"
      pub current_frame: u32,
      pub total_frames: u32,
      pub fps: f64,
      pub eta_seconds: u64,
      pub error: Option<String>,
  }
  ```
- **Frontend Hook**: `useUpscale.ts` listens to `job-status-changed` events via `@tauri-apps/api/event` and drives `ProgressOverlay.tsx`.

### 4. Native Explorer Integration
- **Open File**: `@tauri-apps/plugin-opener` `openPath(filePath)`.
- **Show in Explorer**: `@tauri-apps/plugin-opener` `revealItemInDir(filePath)`.

---

## Decisions Made

| Feature | Technical Approach | Rationale |
|---------|--------------------|-----------|
| Split Slider | CSS `clip-path: inset()` + `requestAnimationFrame` | Zero layout reflow, smooth 60fps GPU rendering. |
| Zoom & Pan | `transform: scale() translate()` | Hardware-accelerated texture inspection up to 400% zoom. |
| Video Progress | IPC event streaming (`JobProgress`) | Real-time percentage, frame counter, and phase tracking. |
| File Actions | `@tauri-apps/plugin-opener` | Native Windows OS file viewer and Explorer folder integration. |

---

## Ready for Planning
- [x] Clip-path slider performance strategy verified
- [x] Zoom and pan mechanics established
- [x] Video pipeline event streaming structured
- [x] Native OS file actions mapped

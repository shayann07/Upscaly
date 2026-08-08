# Debug Session: Upscaling Stuck at 95% on Final Tiles

## Symptom
When upscaling high-resolution images (e.g. 5K 5120x2880), the UI progress bar jumps to 95.0% almost immediately and appears stuck for minutes while processing final tiles.

## Hypotheses & Evidence

### H1: Erroneous `-x` Flag (TTA Mode) (CONFIRMED)
- **Evidence**: In `src-tauri/src/job_queue.rs` (line 319) and `video_pipeline.rs` (line 94), `"-x"` was passed to `realesrgan-ncnn-vulkan` with a code comment claiming it enabled FP16 precision.
- **Fact**: In `realesrgan-ncnn-vulkan`, FP16 is enabled by default in Vulkan NCNN. The `"-x"` flag actually enables **TTA (Test-Time Augmentation)** mode, which performs 8x rotational/flip inference passes per tile, making tile processing 800% slower!
- **Effect**: On a 5K image, 8x TTA forces over 1,000 tile inference passes, causing the process to take several minutes and appear frozen on final tile assembly.

### H2: Fake Percentage Calculation in Rust Job Queue (CONFIRMED)
- **Evidence**: `run_single_image_job` in `src-tauri/src/job_queue.rs` did not parse real progress output from `realesrgan-ncnn-vulkan` (`XX.XX%`). Instead, it ran a fake progress loop `(current_pct + 8.0).min(95.0)` every 60ms.
- **Effect**: The UI progress bar zoomed to 95.0% in less than 1 second, and stayed hard-coded at 95.0% for the remainder of the actual upscaling run.

## Resolution Plan
1. **Remove `-x` TTA Flag**: Delete `"-x"` from `job_queue.rs` and `video_pipeline.rs`.
2. **Stream Real Engine Percentage**: Update `run_single_image_job` to read `realesrgan-ncnn-vulkan` stderr lines, parse `XX.XX%` progress regex, and emit accurate progress (0% -> 100%) to Tauri UI.
3. **Fix TypeScript Build Errors**: Resolve the 16 compilation errors in `src/App.tsx` and UI components.

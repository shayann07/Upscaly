# Debug Session: Video Upscaling Performance & 0.1 FPS Drop Root Cause

## Symptom
**Img1 (Before 1 min):** Progress 10.0% (Frame extraction phase), ETA false reading `0:05`, Rate `14.2 MP/s`, Tile `AUTO` (0).
**Img2 (After 1 min):** Progress 11.0%, ETA `107:33`, Rate `0.1 FPS` (10 seconds per frame!), Tile `AUTO` (0).
**Img3 (Task Manager):** GPU 95%, VRAM 3.1 GB / 6.0 GB, Host Shared RAM 0.3 GB.

## Root Cause Analysis (Confirmed)

1. **`TILE AUTO (0)` Vulkan Memory Swapping (Primary Root Cause)**:
   - When `tile_size` is `0` (`AUTO`), `realesrgan-ncnn-vulkan` disables tile partitioning and attempts to process full 1920x1080 frames in a single pass.
   - For `RealESRGAN Ultra` (23 RRDB blocks), full-frame feature map tensors require **over 12GB of GPU memory**.
   - On an RTX 3050 6GB VRAM GPU, allocating 12GB tensor buffers exceeds physical VRAM. Vulkan falls back to Host System RAM swapping over PCIe.
   - **Result:** GPU utilization runs at 95% while performance drops from **2.5 FPS down to 0.1 FPS** (10 seconds per frame = 15+ hours total processing time).

2. **Initial `ETA 0:05` Fluke (Secondary Symptom)**:
   - During FFmpeg frame extraction (Phase 1, 0% to 10% progress), `percentage` increases to 10% in under 1 second.
   - The frontend fallback ETA estimator calculates `(100 - 10) / (10% / 0.5s) = 4.5 seconds` (`ETA 0:05`).
   - As soon as frame extraction ends and upscaling starts at `0.1 FPS`, ETA jumps to `107:33`.

## Fix Plan
1. **Auto Tile Resolution (`normalize_tile_size`)**:
   - When `tile_size <= 0` (AUTO mode), do NOT pass `0` to NCNN Vulkan for heavy models or video jobs.
   - Resolve AUTO mode to an optimal tile size of **`256`** (or `400` for 6GB+ GPUs).
   - At `256px` tile size, VRAM usage stays safely below 3.0 GB, avoiding PCIe host RAM swapping and restoring speed to **~2.2 - 2.5 FPS** (~35-40 min total for Ultra, ~3 min for Anime Video).
2. **Frontend Fallback ETA Suppression during Frame Extraction**:
   - Suppress fallback ETA calculation while `progress < 10%` or during `extract_frames` phase so `ETA 0:05` does not temporarily flash.

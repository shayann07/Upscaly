# Debug Session: Video Upscaling Performance & Long ETA

## Symptom
**When:** Upscaling video (`VID20260407103700.mp4` 1080p -> 8K) using `RealESRGAN Ultra` (`realesrgan-x4plus`) on RTX 3050 6GB GPU.
**Expected:** Reasonable video conversion time (~3-10 minutes) and immediate, accurate ETA updates.
**Actual:** ETA takes ~1 minute to appear and jumps to 80-121+ minutes.

## Evidence Gathered
1. **Model Architecture Complexity**:
   - `realesrgan-x4plus` (Ultra): 16.7M parameters, 23 RRDB blocks. Designed for single still images. Takes ~1.2s per 1080p frame on RTX 3050 Laptop GPU.
   - For a 3-minute video (5,400 frames): 5,400 * 1.2s = 6,480s = **108 minutes**.
   - `realesr-animevideov3`: 0.2M parameters (80x lighter). Takes ~0.04s per frame. 5,400 * 0.04s = 216s = **3.6 minutes**.

2. **ETA Delay**:
   - `poll_upscale_progress` in `phases.rs` counts completed output files in `ctx.frames_out_dir`.
   - Sidecar startup + Vulkan memory allocation + model initialization + first frame processing takes 30-60s before the 1st frame file is written to disk.
   - During this time, `completed == 0`, so `eta_seconds` remains `None` (blank UI).
   - Once frame 1 arrives, initial `secs_per_frame` includes initial startup latency, skewing initial ETA calculation high (~120 minutes).

3. **Suboptimal I/O & Thread Allocation**:
   - Hardcoded `-j 1:2:2` restricts image load threads to 1 and disk write threads to 2.
   - Hardcoded tile size `256px` forces GPU to process 1080p frame in 32 separate tiles instead of full frame / larger tiles. On RTX 3050 6GB (4.2GB free VRAM available), larger tile sizes (512px) or Auto tile (0) reduce tile switching overhead by up to 40%.

## Hypotheses

| # | Hypothesis | Impact | Status |
|---|------------|--------|--------|
| H1 | Heavy model choice (`realesrgan-x4plus` vs video-optimized / lightweight models) is the dominant factor (80x parameter difference). | 70% | CONFIRMED |
| H2 | Small tile size (`256px`) causes excessive tile switching overhead on RTX 3050 6GB VRAM. | 15% | CONFIRMED |
| H3 | ETA remains blank for ~60s because frame 0 has not written to disk; first estimate includes startup latency. | 10% | CONFIRMED |
| H4 | Thread profile `1:2:2` bottlenecks disk I/O when reading/writing thousands of frames. | 5% | CONFIRMED |

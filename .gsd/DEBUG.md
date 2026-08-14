# Debug Session: VRAM_OVERFLOW_SYSTEM_FREEZE

## Symptom
When selecting **512px tile size** on a 6GB NVIDIA RTX 3050 Laptop GPU for video upscaling:
- UI projected VRAM usage: ~3.3 GB
- Actual VRAM spiked to >6.0 GB (100% physical VRAM exhaustion)
- System / DWM / Task Manager froze, requiring a hard laptop reboot.

---

## Root Cause Analysis
1. **Multi-Pipeline GPU Allocation via `-j` Flag**:
   In `src-tauri/src/video_pipeline/phases.rs` (line 244) and `job_queue.rs` (line 429), the arguments hardcoded:
   `-j 2:2:2` (in phases.rs) and `-j 1:2:2` (in job_queue.rs).
2. **Vulkan Pipeline Multiplier**:
   In RealESRGAN NCNN Vulkan, `-j load:proc:save` controls:
   - `proc`: The number of concurrent **GPU worker inference pipelines**.
   - Each `proc` thread allocates its own full Vulkan memory buffers and intermediate layer tensors.
3. **VRAM Math for 512px**:
   - Single pipeline at 512px tile: ~3.2 – 3.4 GB VRAM.
   - Two pipelines (`proc = 2`) at 512px tile: **3.3 GB × 2 = ~6.6 GB VRAM**.
4. **Why the System Froze**:
   Physical GPU VRAM is 6.0 GB. When Vulkan allocated 6.6 GB, Windows WDDM was forced into emergency PCIe paging (swapping GPU buffers back and forth into system RAM at PCIe bus latency). Because the GPU memory controller saturated the PCIe bus and CPU memory bus, the Windows DWM (Desktop Window Manager) compositor starved, freezing the mouse, display, and Task Manager entirely.

---

## Mitigation & Prevention Architecture
1. **Dynamic Thread Auto-Scaling**:
   - For `tile_size >= 384` (e.g. 512px): Automatically force `proc = 1` (`-j 1:1:2` or `-j 2:1:2`).
   - For `tile_size <= 256`: Allow `proc = 2` only if GPU total VRAM >= 6GB; otherwise force `proc = 1`.
2. **GPU VRAM Safety Cap & Warning in UI**:
   - In Settings and Batch Queue, calculate total VRAM taking `proc_threads` into account (`single_pipe_vram * proc_threads`).
   - If projected VRAM exceeds 75% of total GPU VRAM, highlight in warning yellow/red and automatically downscale `proc_threads` to 1.
3. **Hard VRAM Guardrails in Backend**:
   - Backend checks `normalize_execution_params(gpu_vram_mb, tile_size)` before spawning sidecar to ensure VRAM never exceeds 75% of physical VRAM.

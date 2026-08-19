# Third-Party Notices & Open Source Licenses

This document records the third-party software, binaries, and libraries bundled with or used by **Upscaly Studio**.

Upscaly Studio itself is MIT-licensed (see [`LICENSE`](../LICENSE)). The components below keep their own licenses.

---

## 1. FFmpeg & FFprobe (GPL v3)

- **Source / Provider**: [FFmpeg Project](https://ffmpeg.org/), via [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) — the exact release and SHA-256 hashes are pinned in [`src-tauri/sidecar-manifest.json`](../src-tauri/sidecar-manifest.json)
- **Architecture**: Windows x86_64 (x64)
- **License**: **GNU General Public License (GPL) v3**, from a build configured `--enable-gpl --enable-version3`
- **Includes GPL components**: `libx264`, `libx265`, `libxvid` and others

### Not bundled — downloaded from upstream

**Upscaly Studio does not redistribute FFmpeg.** Neither the repository nor the installer contains these binaries. The installer downloads them from the pinned BtbN release during installation, and the app can fetch them later if that did not happen, so the copy on your machine comes directly from the upstream project and is governed solely by its own license.

### Why the GPL build

Upscaly Studio encodes with hardware encoders first (`h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_mf`), none of which are GPL. Its encoder chain then falls back to **`libx264`** software encoding when no hardware encoder is available or all of them fail — on a virtual machine, an older integrated GPU, or a broken driver. That rung only works in a GPL build; an LGPL build would leave `mpeg4` as the last resort and produce visibly worse output on exactly the machines least able to spare quality.

### Source access

FFmpeg source for the pinned build is available from the FFmpeg project at https://ffmpeg.org/download.html and from the build's own repository at https://github.com/BtbN/FFmpeg-Builds.

> **If you redistribute FFmpeg yourself** — for example by mirroring these binaries or shipping a build that bundles them — GPL v3 obligations apply to you, including making the corresponding source available. Fetching them at install time, as Upscaly Studio does, is not redistribution.

---

## 2. Real-ESRGAN NCNN Vulkan

- **Project**: [Real-ESRGAN NCNN Vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)
- **License**: BSD 3-Clause / MIT
- **Framework**: NCNN Neural Network Inference Framework (Tencent)
- **Bundled**: yes — shipped inside the installer.

### `vcomp140.dll`

- **Component**: Microsoft Visual C++ OpenMP runtime, redistributed under the Visual Studio redistributable terms
- **Why**: `realesrgan-ncnn-vulkan.exe` imports it directly and will not start without it. Only the release runtime is shipped; the debug build (`vcomp140d.dll`) is deliberately excluded, as Microsoft's terms do not permit redistributing debug runtimes.

---

## 3. Model weights

Model weights are **not** bundled. They are downloaded on demand from commit-pinned URLs with verified SHA-256 hashes; see `src-tauri/src/engine/registry_provider.rs` for the catalog, which records each model's own license and origin.

---

## 4. Component manifest

| Component                             | Delivery                          | License          | Role                                          |
| :------------------------------------ | :-------------------------------- | :--------------- | :-------------------------------------------- |
| `realesrgan-ncnn-vulkan.exe`          | Bundled in installer              | BSD 3-Clause     | Image / frame neural upscaling                |
| `vcomp140.dll`                        | Bundled in installer              | MS redistributable | OpenMP runtime required by the engine       |
| `ffmpeg-x86_64-pc-windows-msvc.exe`   | Downloaded from upstream at install | **GPL v3**     | Video demuxing, frame extraction & reassembly |
| `ffprobe-x86_64-pc-windows-msvc.exe`  | Downloaded from upstream at install | **GPL v3**     | Stream analysis & VFR/CFR timing detection    |
| Model weights (`.param` / `.bin`)     | Downloaded on demand              | Per model        | Upscaling networks                            |

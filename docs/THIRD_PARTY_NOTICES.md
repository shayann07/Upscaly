# Third-Party Notices & Open Source Licenses

This document records the third-party software, binaries, and libraries bundled with or utilized by **Upscaly**.

---

## 1. FFmpeg & FFprobe (LGPL v2.1 / v3.0 Distribution)

- **Source / Provider**: [FFmpeg Project](https://ffmpeg.org/) / Gyan.dev LGPL Builds
- **Architecture**: Windows x86_64 (x64)
- **License**: GNU Lesser General Public License (LGPL) v2.1 / v3.0
- **Build Configuration Flags**: `--enable-version3 --disable-gpl --disable-nonfree --enable-shared`
- **GPL Exclusion Notice**: This distribution explicitly **excludes** GPL-only libraries (such as `libx264`, `libx265`, `libxvid`). Video encoding is handled via OS/vendor hardware encoders (`h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_mf`).

### License Summary & Source Access
Under the terms of the LGPL v2.1/v3.0, you are permitted to re-link or replace the FFmpeg shared dynamic libraries. The source code for the exact version of FFmpeg bundled with this release can be obtained directly from the official repository at:
https://ffmpeg.org/download.html

---

## 2. Real-ESRGAN NCNN Vulkan

- **Project**: [Real-ESRGAN NCNN Vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)
- **License**: BSD 3-Clause License / MIT License
- **Framework**: NCNN Neural Network Inference Framework (Tencent)

---

## 3. Bundled Executables Manifest

| Binary Name | Target Platform | License | Role |
| :--- | :--- | :--- | :--- |
| `realesrgan-ncnn-vulkan-x86_64-pc-windows-msvc.exe` | Windows x64 | BSD 3-Clause | Image / Frame Neural Upscaling |
| `ffmpeg-x86_64-pc-windows-msvc.exe` | Windows x64 | LGPL v2.1/v3.0 | Video Demuxing, Frame Extraction & Reassembly |
| `ffprobe-x86_64-pc-windows-msvc.exe` | Windows x64 | LGPL v2.1/v3.0 | Stream Analysis & VFR/CFR Timing Detection |

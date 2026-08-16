<div align="center">

# Upscaly

**A free, open-source AI image and video upscaler for Windows. Runs entirely on your own GPU — nothing is uploaded, nothing is metered, no account required.**

Real-ESRGAN super-resolution with a proper desktop UI: batch queues, a VRAM governor that keeps your machine alive, lossless video pipelines, and a curated model catalog you can extend with your own.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)](#requirements)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Offline](https://img.shields.io/badge/100%25-offline-brightgreen)](#privacy)

</div>

---

## Table of contents

- [Why Upscaly](#why-upscaly)
- [Features](#features)
- [Screenshots](#screenshots)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Choosing a model](#choosing-a-model)
- [Settings reference](#settings-reference)
- [Upscaling video](#upscaling-video)
- [Custom models](#custom-models)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Building from source](#building-from-source)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Privacy](#privacy)
- [License](#license)

---

## Why Upscaly

Most AI upscalers are either a web service that wants your photos and your credit card, or a command-line tool that expects you to know what a tile size is. Upscaly is a desktop app that runs the same models locally, for free, and makes the decisions that matter visible instead of hiding them.

Concretely, it tries hard to never lie to you:

- **The VRAM governor refuses configurations that would crash your GPU**, and tells you when it clamped one. Ask for a 512px tile at 4× on a 6 GB card and it runs 384 and says so — rather than exhausting device memory and taking the display driver down with it.
- **Nothing is silently re-encoded.** Video frames stay lossless end to end. Image output is PNG by default, and the panel says plainly which formats discard detail.
- **The GPU you pick is the GPU that runs.** Devices are matched by name, not by Vulkan's device index, which is not stable across launches on hybrid laptops.
- **Readouts report what actually happened.** The overlay shows the tile that ran, not the one you asked for, and every model download is verified against a pinned SHA-256 that fails closed.

---

## Features

### Upscaling

- **Real-ESRGAN** super-resolution at **2×, 3× and 4×**
- **Nine built-in models** across photo, anime and video categories
- **Custom model folder** — drop in any ncnn `.param` + `.bin` pair
- **Quality / Balanced / Speed presets**, including optional TTA (8-pass test-time augmentation)
- **Batch queue** with drag-to-reorder, per-item cancel, and per-item error attribution
- Compatible images in a batch share **one engine process**, skipping repeated model loads

### Video

- Full pipeline: extract → upscale → reassemble, with the **audio track preserved**
- **Lossless PNG intermediate frames** — no JPEG generation loss on the model's input or output
- **Hardware encoding** via NVENC / QuickSync / AMF where available
- **Variable frame rate sources normalised to CFR**, so audio does not drift
- **Disk pre-flight check** — refuses to start rather than filling your drive an hour in
- Extraction is **throttled** so ffmpeg cannot race ahead and write tens of GB of unused frames

### Safety and control

- **VRAM governor** sizes tile and thread count against your card's actual memory
- **Live GPU-exhaustion guard** kills the engine on the first failed allocation, before the driver is lost
- **Automatic tile back-off and retry** on video when memory runs short
- **GPU selection by device name**, resolved fresh at every launch
- **Hash-verified model downloads** that refuse to install unverified bytes

### Interface

- Side-by-side and split **before/after comparison** with zoom
- Live VRAM, tile, rate and ETA readouts
- **Recent history** with one-click reload
- Frameless custom window, keyboard-driven

---

## Screenshots

> **Contributors welcome here** — add screenshots to `docs/screenshots/` and link them below.

|   Studio view    |  Model catalog   |     Settings     |
| :--------------: | :--------------: | :--------------: |
| _add screenshot_ | _add screenshot_ | _add screenshot_ |

---

## Requirements

|             | Minimum                        | Recommended                                                   |
| ----------- | ------------------------------ | ------------------------------------------------------------- |
| **OS**      | Windows 10 x64                 | Windows 11 x64                                                |
| **GPU**     | Any **Vulkan 1.2** capable GPU | Discrete NVIDIA / AMD, 6 GB+ VRAM                             |
| **Drivers** | Current vendor drivers         | Current vendor drivers                                        |
| **Disk**    | ~1 GB for the app and models   | Much more for video — see [Upscaling video](#upscaling-video) |

Integrated GPUs (Intel UHD/Iris, AMD Radeon Graphics) work but are considerably slower, and the governor will clamp tiles accordingly.

> **Windows only for now.** The engine and ffmpeg sidecars are Windows x64 builds, and free-disk-space detection uses a Win32 call. The Rust and React code is otherwise portable — see [Contributing](#contributing) if you want to help port it.

---

## Install

### Option 1 — download a release

Grab the latest installer from the [Releases page](https://github.com/shayann07/Upscaly/releases) and run it.

On first launch no models are installed yet — open the **Models** tab and download the one you want (~34 MB each, once). Every download is verified against a pinned SHA-256 and refuses to install on a mismatch. Nothing else phones home.

### Option 2 — build it yourself

See [Building from source](#building-from-source).

---

## Quick start

1. **Open a file** — drag and drop, or `Ctrl+O`. Images: `png`, `jpg`, `jpeg`, `webp`. Video: `mp4`, `mkv`, `mov`, `avi`.
2. **Pick a category** — Photo, Anime or Video. This filters the model list to models trained for that content.
3. **Pick a model** — see [Choosing a model](#choosing-a-model).
4. **Pick a scale** — 2×, 3× or 4×.
5. **Press Upscale** (or `Ctrl+Enter`).

Drop several files at once to build a batch. Results land next to the input unless you set an output directory in Settings.

> Models are fixed-factor. Asking for 2× from a 4×-only model produces a 4× image, and Upscaly will tell you rather than silently switching you to a model trained for different content.

---

## Choosing a model

This is the setting that most affects your result. All the photo models below run at the same speed — they differ only in what they were trained on.

| Model                                      | Best for                              | Character                                                                           |
| ------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| **RealESRGAN Ultra** (`realesrgan-x4plus`) | General purpose                       | The stock model. Reliable, occasionally plasticky on skin.                          |
| **Remacri**                                | **Photographs, film and print scans** | Sharper texture and edge detail than stock. A strong default for real-world photos. |
| **High Fidelity**                          | Archival work, documents              | Conservative. Least likely to invent detail that was never there.                   |
| **UltraSharp**                             | Already-clean digital sources         | Strong edge definition and micro-contrast. Will amplify grain and dust on scans.    |
| **Nomos 8k SC**                            | Portraits, nature                     | Natural texture, gentler than UltraSharp on skin and foliage.                       |
| **RealESRGAN Anime Art**                   | Illustration, manga                   | Line work, flats and cel shading.                                                   |
| **Anime Video 2× / 3× / 4×**               | Animated video                        | Frame sequences, tuned for throughput.                                              |

**Rules of thumb**

- Scanned or grainy photo → **Remacri**, fall back to **Nomos 8k SC** if it looks over-sharpened.
- Faces matter → avoid **UltraSharp**; micro-contrast on skin reads as harsh.
- You need it to stay faithful → **High Fidelity**.
- Line art → **Anime Art**, never a photo model.

No upscaler fixes colour casts, fading, or dust — those are restoration problems, and a sharper model makes dust _more_ visible.

---

## Settings reference

### Presets

| Preset       | Tile                    | TTA               | Codec threads | Use when                                             |
| ------------ | ----------------------- | ----------------- | ------------- | ---------------------------------------------------- |
| **Quality**  | Largest the card allows | **On** (8 passes) | 2             | Single images where you want the best possible edges |
| **Balanced** | Engine-tuned            | Off               | 2             | **Default.** Everything else.                        |
| **Speed**    | Engine-tuned            | Off               | 4             | Large batches — wider decode/encode, identical image |

> **TTA is roughly 8× the GPU work.** On a single image that is seconds. On a 300-frame clip it is the difference between about an hour and about eight, so Upscaly asks for confirmation before starting a video run under Quality.

Presets only ever _propose_ settings. The VRAM governor has the final say on tile size, and an explicit tile choice always overrides the preset.

### Tile size

`AUTO`, `128`, `256`, `384`, `512`. Larger tiles mean fewer seams; smaller tiles use less VRAM. `AUTO` delegates to the engine's own heap heuristic.

Whatever you pick, the governor sizes it against your card and the scale factor — a 512px tile costs four times as much at 4× as at 2×. If it clamps your choice, the panel says so and the progress overlay shows `384px (512 capped)`.

### Output format

Images only; video is always MP4.

| Format   | Lossless | Notes                                                    |
| -------- | -------- | -------------------------------------------------------- |
| **PNG**  | Yes      | Default. Exactly what the model produced. Large files.   |
| **JPG**  | No       | Much smaller, discards detail the upscale just produced. |
| **WEBP** | No       | Better than JPG at the same size, keeps transparency.    |

### Device

Lists every Vulkan device with its VRAM. Your choice is stored **by name** and re-resolved at each launch, because Vulkan's device ordering is not stable on hybrid laptops — a saved index can silently come to mean a different card.

---

## Upscaling video

Video works, and it is slow and disk-hungry. Both are inherent to the job, not bugs.

**Disk.** Intermediate frames are lossless PNG. A 294-frame 1080p clip at 4× needs roughly **15 GB** of temporary space. Upscaly estimates this before extraction and refuses to start if the drive cannot hold it. Temporary files are deleted when the job finishes or is cancelled.

**Time.** A 4× upscale renders every frame at sixteen times the pixel count. Expect minutes per hundred frames on a discrete GPU, and considerably longer with TTA enabled.

**What is preserved.** The audio track is copied through untouched. Variable-frame-rate sources are normalised to constant frame rate at extraction, so audio and video do not drift apart over long clips.

**Tips**

- Use **Balanced**, not Quality, unless you have hours to spare.
- Test on a short clip before committing to a long one.
- Prefer a fast SSD for the temp directory.

---

## Custom models

Upscaly runs any [ncnn](https://github.com/Tencent/ncnn)-format model — a matching `.param` + `.bin` pair.

1. Put your pairs in a folder.
2. **Settings → Custom Model Folder → Browse**.
3. They appear in the model list immediately.

Nothing is copied — the files stay where you put them. If a name collides with a built-in model, the built-in wins, so a stray file cannot silently change what an existing selection runs.

Good sources: [OpenModelDB](https://openmodeldb.info/), [upscayl/custom-models](https://github.com/upscayl/custom-models). Models in PyTorch `.pth` format must be converted to ncnn first.

---

## Keyboard shortcuts

| Shortcut     | Action                                                        |
| ------------ | ------------------------------------------------------------- |
| `Ctrl+O`     | Open file(s)                                                  |
| `Ctrl+Enter` | Start upscaling                                               |
| `Ctrl+S`     | Toggle Settings                                               |
| `Ctrl+H`     | Toggle History                                                |
| `Esc`        | Dismiss dialog, or cancel the running job (with confirmation) |

---

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable, 2021 edition)
- [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/) — on Windows, the MSVC build tools and WebView2

### Sidecar binaries

Executables are **not** committed (`*.exe` is gitignored — ffmpeg alone is ~240 MB). Place these in `src-tauri/binaries/` before building:

| File                                                | Source                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `realesrgan-ncnn-vulkan-x86_64-pc-windows-msvc.exe` | [Real-ESRGAN-ncnn-vulkan releases](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases) |
| `ffmpeg-x86_64-pc-windows-msvc.exe`                 | [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) — **LGPL build**                                |
| `ffprobe-x86_64-pc-windows-msvc.exe`                | as above                                                                                        |

Tauri's sidecar naming requires the `-x86_64-pc-windows-msvc` suffix exactly.

**Model weights are not committed either.** They are downloaded on demand from
commit-pinned URLs with verified SHA-256 hashes, so a fresh clone has none and
the app will send you to the Models tab on first run. That keeps the repository
small: the weights previously accounted for 45 MB of a 56 MB clone.

### Run and build

```bash
npm install
npm run tauri dev     # development, hot reload
npm run tauri build   # production installer in src-tauri/target/release/bundle
```

### Quality gate

Everything below must pass before a commit:

```bash
npm run check:quality
```

That runs, in order:

```bash
npm run check:ts            # tsc --noEmit
npm run lint:ts             # eslint
npm run test                # vitest  (108 tests)
npm run check:rust          # cargo clippy -D warnings
npm run format:check:all    # prettier + cargo fmt
```

Rust tests separately:

```bash
cargo test --manifest-path src-tauri/Cargo.toml   # 132 tests
```

### IPC types are generated

TypeScript definitions in `src/lib/ipc/` are generated from the Rust structs with [ts-rs](https://github.com/Aleph-Alpha/ts-rs). **Never edit them by hand.** After changing any Rust type that crosses the IPC boundary:

```bash
npm run gen:types
```

and commit the result.

---

## Architecture

```
┌──────────────────────────────────────────┐
│  React 19 + TypeScript (WebView)         │
│  · hand-rolled external store            │
│  · selector hooks, memoised components   │
└───────────────┬──────────────────────────┘
                │  Tauri IPC (types generated by ts-rs)
┌───────────────▼──────────────────────────┐
│  Rust backend                            │
│  · job_store    authoritative job state  │
│  · job_queue    serial worker + cancel   │
│  · image_batch  shared-process batching  │
│  · vram_governor tile/thread sizing      │
│  · video_pipeline extract/upscale/mux    │
└───────────────┬──────────────────────────┘
                │  sidecar processes
┌───────────────▼──────────────────────────┐
│  realesrgan-ncnn-vulkan   ffmpeg/ffprobe │
└──────────────────────────────────────────┘
```

**Design rules this codebase holds to**

- The **backend owns job state**. The frontend mirrors a snapshot; it never derives authoritative state from an event stream.
- **One canonical job vocabulary** (`queued` / `running` / `succeeded` / `failed` / `cancelled`), with the same validated transition table on both sides.
- Progress updates are **coalesced** into a single event per flush window rather than one per tick.
- The backend owns **output naming** and **VRAM figures**. The frontend never invents either.
- **Unmeasured values render as unknown**, never as a plausible-looking placeholder.

Longer design notes live in [`docs/`](docs/).

---

## Troubleshooting

<details>
<summary><b>The whole machine froze during an upscale</b></summary>

A GPU that runs out of memory can take the display driver with it.

- **`Win`+`Ctrl`+`Shift`+`B`** restarts the Windows display driver in place. Screen blanks, beeps, comes back — usually without a reboot.
- To stop the engine from a terminal:
  ```powershell
  Get-Process realesrgan*,ffmpeg* -EA SilentlyContinue | Stop-Process -Force
  ```

Current versions size tiles against your actual VRAM and kill the engine on the first failed allocation, so this should not happen. Please [open an issue](https://github.com/shayann07/Upscaly/issues) if it does, with your GPU model, tile size and scale.
</details>

<details>
<summary><b>"No Vulkan GPU found"</b></summary>

Install current vendor drivers. Very old GPUs may not support Vulkan 1.2 at all. Laptop users: check the GPU is not disabled in a power-saving profile.
</details>

<details>
<summary><b>It's using my integrated GPU instead of my discrete one</b></summary>

Open **Settings → Device** and select the discrete card explicitly. The choice is stored by name and re-resolved each launch.

Note that high integrated-GPU usage during _video_ jobs is normal — that is playback and decode, not the upscaler.
</details>

<details>
<summary><b>The job says "Calculating…" or looks stuck</b></summary>

Check the rate readout. Below 1 frame per second it reports **seconds per frame** — `80 s/frame` means it is working, just slowly. TTA (Quality preset) multiplies frame time by roughly eight.
</details>

<details>
<summary><b>Not enough disk space for a video</b></summary>

Lossless PNG frames are large. Free up space, use a shorter clip, or lower the scale factor — 2× needs a quarter of the intermediate space of 4×.
</details>

<details>
<summary><b>A model download fails an integrity check</b></summary>

Working as designed: the bytes did not match the pinned SHA-256, so nothing was installed. Retry — if it persists, [open an issue](https://github.com/shayann07/Upscaly/issues).
</details>

---

## Contributing

Contributions are welcome — bug reports, models, docs, screenshots, and especially **macOS and Linux ports**.

1. Fork and branch from `main`.
2. Make your change.
3. `npm run check:quality` must pass, and `cargo test --manifest-path src-tauri/Cargo.toml`.
4. Open a pull request describing what changed and why.

**House style:** comments explain _why_, not _what_. If a line looks odd, the comment should say what breaks without it. Tests should state the failure they prevent.

Good first issues: screenshots for this README, additional model catalog entries (with verified hashes and commit-pinned URLs), and cross-platform sidecar/disk-space support.

---

## Privacy

Upscaly is **fully offline**. Your images and videos never leave your machine. There is no telemetry, no analytics, no account, and no network connection at all except when you explicitly download a model from the catalog.

---

## License

Released under the [MIT License](LICENSE) — free for personal and commercial use.

### Third-party components

Upscaly bundles software under its own licenses. Full details in [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md).

| Component                                                                     | License                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| [Real-ESRGAN ncnn Vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) | BSD 3-Clause / MIT                             |
| [ncnn](https://github.com/Tencent/ncnn) (Tencent)                             | BSD 3-Clause                                   |
| [FFmpeg / FFprobe](https://ffmpeg.org/)                                       | **LGPL v2.1 / v3.0** (GPL components excluded) |
| [Tauri](https://tauri.app)                                                    | MIT / Apache-2.0                               |

> **If you redistribute builds of Upscaly**, the bundled FFmpeg is LGPL. You must keep the notices intact and make its source available. Upscaly ships an LGPL build with GPL-only encoders (x264, x265, xvid) excluded, relying on hardware encoders instead — do not swap in a GPL build without understanding what that means for your distribution.

Model weights are the property of their respective authors: Remacri by **FoolhardyVEVO**, UltraSharp by **Kim2091**, and the Real-ESRGAN models by **Xintao Wang et al.**

---

## Acknowledgements

- [Xintao Wang and the Real-ESRGAN team](https://github.com/xinntao/Real-ESRGAN) for the models and the ncnn-Vulkan engine
- [Tencent ncnn](https://github.com/Tencent/ncnn) for the inference framework
- [Upscayl](https://github.com/upscayl/upscayl) for maintaining ncnn conversions of community models
- The model authors on [OpenModelDB](https://openmodeldb.info/)

<div align="center">

**If Upscaly is useful to you, a ⭐ helps other people find it.**

[Report a bug](https://github.com/shayann07/Upscaly/issues) · [Request a feature](https://github.com/shayann07/Upscaly/issues) · [Discussions](https://github.com/shayann07/Upscaly/discussions)

</div>

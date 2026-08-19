# Upscaly Studio — Production Readiness Plan

**Date:** 2026-08-19 · **Version under review:** 1.0.1 (uncommitted, branch `main`) · **Target:** first public release via CI

This document is self-contained: an implementing agent needs no other context. Every item states why it matters, the exact files, the change (with code), and how to verify it. Work top to bottom; P0 items are release-breaking.

---

## 0. Ground truth: the release build RUNS

Empirically verified on 2026-08-19 on the dev machine (Windows 11, RTX 3050):

- The newest release installer (`Upscaly Studio_1.0.1_x64-setup.exe`, built 11:34) installs silently (exit 0), launches, shows a visible 1280×800 window with the full dashboard, and detects the GPU.
- `upscaly.exe` has **zero** crash events in the Windows Application log — ever.
- The crash events that DO exist (exception `0xc0000409`, twice per launch) are all the **engine sidecar** `realesrgan-ncnn-vulkan.exe`, killed by its own GPU probe when no models are installed. This is handled (the probe parses output regardless of exit) but noisy — see P2-15.
- The reported "release build does not even run" was **not reproducible**. At the time of that report (12:05), the app process ran far enough to execute its GPU probe, which only happens after React is alive. Most likely explanations, in order: (a) a cold start where Defender scans the freshly written binary and the window (created hidden by design) takes 5–15 s to appear, read as "dead"; (b) the frontend hand-over failing on that specific launch, leaving the hidden-window state that P1-6/P1-7 below eliminate. If the report recurs after P1 lands, capture `%APPDATA%\com.wexpa.upscaly\logs\` (exists after P1-9) and the Windows Application log.

The plan therefore has two goals: make the **release pipeline** actually deliverable (P0 — it is broken today in ways that don't show locally), and make startup **un-brickable and diagnosable** (P1 — the current design has states where a failure leaves an invisible or unclosable window and no log anywhere).

---

## P0 — Release-breaking. Fix before tagging v1.0.1.

### P0-1 · CSP is missing `connect-src` for Tauri IPC — every `invoke()` is degraded in production

**Why:** Tauri v2 on Windows transports IPC as `fetch()` to `http://ipc.localhost/<cmd>`. The document origin is `http://tauri.localhost`, so this is cross-origin, and with no `connect-src` the CSP falls back to `default-src 'self'` → blocked. Tauri then logs `IPC custom protocol failed` and permanently latches onto the legacy `postMessage` fallback: the app *works*, but every IPC call runs on a slower transport with payload-size limits, and the very first invokes (`launch_elapsed_ms`, `list_gpus`) each burn a wasted round trip. Invisible in `tauri dev` (CSP is injected only into bundled builds) — same failure class as the asset-protocol preview bug already fixed.

**File:** `src-tauri/tauri.conf.json` (the `security.csp` string)

**Change** — replace the CSP value with:

```
default-src 'self' ipc: http://ipc.localhost; connect-src 'self' ipc: http://ipc.localhost; img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:; media-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'none';
```

(`base-uri`/`form-action` are free hardening; neither falls back to `default-src`.)

**Verify:** build, install, launch with the environment variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--auto-open-devtools-for-tabs`, and confirm the console has zero `Refused to connect` / `IPC custom protocol failed` entries.

### P0-2 · The updater download URL 404s — GitHub renames assets containing spaces

**Why:** `productName` is `"Upscaly Studio"`, so the NSIS artifact is `Upscaly Studio_1.0.1_x64-setup.exe`. GitHub Releases sanitizes asset filenames (anything outside `[A-Za-z0-9._-]` becomes `.`), so the uploaded asset is `Upscaly.Studio_1.0.1_x64-setup.exe` — but `.github/workflows/release.yml` writes `latest.json` using the **local** basename. Every `downloadAndInstall()` will fail with a 404, forever. Did not exist at v0.1.0 (single-token name).

**Decision made:** keep `productName: "Upscaly Studio"` (explicit user requirement: release is "Upscaly Studio", debug is "Upscaly") and make the workflow rename the artifact deterministically before upload. Do NOT guess at GitHub's sanitize rule.

**File:** `.github/workflows/release.yml` — in the publish job, after the build step and before `gh release create`:

```bash
# NSIS names the artifact after productName, which contains a space.
# GitHub rewrites asset filenames on upload, so publish under a
# deterministic space-free name and point latest.json at exactly that.
bundle="src-tauri/target/release/bundle/nsis"
orig=$(ls "$bundle"/*-setup.exe)
asset="$bundle/Upscaly-Studio_${VERSION}_x64-setup.exe"
mv "$orig" "$asset"
mv "$orig.sig" "$asset.sig"
case "$(basename "$asset")" in (*' '*) echo "::error::asset name contains a space"; exit 1;; esac
```

Then use `$asset` for the release upload and `$(basename "$asset")` in the `latest.json` URL. Also fix the hardcoded release title on the `gh release create` line: `--title "Upscaly Studio v${VERSION}"` (it currently says "Upscaly v…").

**Verify:** after the first CI release, `curl -sL https://github.com/shayann07/Upscaly/releases/latest/download/latest.json` and confirm the `url` field downloads with HTTP 200 (`curl -sIL <url> | head -1`).

### P0-3 · The 0.1.0 → 1.0.1 update installs a second, parallel app

**Why:** both the NSIS identity (`productName` "Upscaly" → "Upscaly Studio" changes `$INSTDIR`, the uninstall registry key, and the Start Menu shortcut) and the data identity (`identifier` `com.shaya.ai-upscaler` → `com.wexpa.upscaly` changes `app_data_dir`) changed in one bump. When a 0.1.0 install runs the 1.0.1 updater: the new installer finds no prior install under its new keys, installs to a fresh `%LOCALAPPDATA%\Upscaly Studio`, never uninstalls the old app (297 MB left behind, still in Add/Remove Programs, still auto-checking updates forever), orphans all settings/history/model weights, and re-downloads ffmpeg's ~290 MB.

**Decision made:** v0.1.0 has no real users (it was only ever installed on the dev machine). Accept the identity break — do NOT write a data migration — but clean up the old install so the dev machine and any stray 0.1.0 installs converge. Add a preinstall hook.

**File:** `src-tauri/installer-hooks.nsh` — add:

```nsis
!macro NSIS_HOOK_PREINSTALL
  ; v0.1.0 shipped as productName "Upscaly" with publisher "shayann07",
  ; so this build's own registry keys cannot see it. Uninstall it here:
  ; leaving it produces two apps in Add/Remove Programs, two shortcuts,
  ; and an old install that offers this very update forever.
  ReadRegStr $0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly" "UninstallString"
  ${If} $0 != ""
    ReadRegStr $1 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly" "InstallLocation"
    ; Strip surrounding quotes the installer writes around the path.
    StrCpy $2 $1 1
    ${If} $2 == '"'
      StrLen $3 $1
      IntOp $3 $3 - 2
      StrCpy $1 $1 $3 1
    ${EndIf}
    DetailPrint "Removing previous Upscaly 0.1.0 install"
    ; /UPDATE preserves nothing we need -- run a plain silent uninstall.
    ExecWait '$0 /S _?=$1'
    Delete "$0"
    RMDir "$1"
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly"
    DeleteRegKey SHCTX "Software\shayann07\Upscaly"
    Delete "$SMPROGRAMS\Upscaly.lnk"
  ${EndIf}
!macroend
```

Note: the hooks file already defines POSTINSTALL and PREUNINSTALL macros; add this alongside them. NSIS `ExecWait` on an uninstaller requires the `_?=` argument for synchronous execution — without it the uninstaller copies itself to temp and returns immediately.

Old app data at `%APPDATA%\com.shaya.ai-upscaler` is deliberately left in place (nothing valuable for a test-only install; deleting user data from an installer is worse than orphaning 34 MB). Document this in the release notes.

**Verify:** on a VM (or the dev machine), install v0.1.0 from the GitHub release, then run the new installer. Confirm: one entry in Add/Remove Programs, one Start Menu shortcut, `%LOCALAPPDATA%\Upscaly` gone.

### P0-4 · A `--debug` bundle self-updates to the release build

**Why:** two config leaks compound. (1) `tauri.dev.conf.json` doesn't override `plugins.updater`, so a `npm run tauri:build:dev` bundle inherits the production endpoint. (2) The frontend guard `!import.meta.env.DEV` doesn't help, because `tauri build --debug` runs a production Vite build — `DEV` is `false`. Result: the installed debug app checks the real endpoint and will happily install the release NSIS over itself. Also, the dev config inherits `createUpdaterArtifacts: true`, so `tauri:build:dev` errors at the signing step for anyone without the private key.

**Files and changes:**

`src-tauri/tauri.dev.conf.json` — add at the top level:

```json
"bundle": { "createUpdaterArtifacts": false },
"plugins": { "updater": { "endpoints": [] } }
```

`src-tauri/src/commands/window.rs` — add (and register in `lib.rs`'s `generate_handler!`):

```rust
/// Whether this binary was compiled with debug assertions. The frontend's
/// `import.meta.env.DEV` cannot answer this: `tauri build --debug` runs a
/// production Vite build, so DEV is false inside a debug bundle.
#[tauri::command]
pub async fn is_debug_build() -> bool {
    cfg!(debug_assertions)
}
```

`src/lib/updater.ts` — make the support check consult the build profile (cache the invoke result in a module variable; call sites are already async):

```ts
let debugBuild: boolean | null = null;
async function updatesSupported(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  if (debugBuild === null) {
    debugBuild = await invoke<boolean>('is_debug_build').catch(() => false);
  }
  return !debugBuild;
}
```

Update call sites to `await updatesSupported()` and update the doc comment that currently (wrongly) claims `import.meta.env.DEV` excludes debug bundles.

**Verify:** `npm run tauri:build:dev` completes with no signing error; install it, open Settings → check for updates, confirm it reports updates unavailable in debug rather than offering 1.0.1.

### P0-5 · The release workflow can publish a build CI has failed

**Why:** `release.yml` triggers on push to `main` and gates only on version-number comparison — it never runs tests, clippy, or type checks, and doesn't depend on `ci.yml`. A version bump merged with a broken test suite ships a signed release.

**File:** `.github/workflows/release.yml` — in the build job, before the "Build installer" step:

```yaml
- name: Quality gate
  run: |
    npm run check:quality
```

(`check:quality` = tsc + eslint + vitest + clippy + both formatters; it needs the same sidecar stubs `ci.yml` creates — copy that step, or extract it to a composite action used by both workflows.)

**Verify:** push a branch with a deliberately failing test and a version bump to a fork/test branch; confirm the release job fails before building.

---

## P1 — Un-brickable startup and diagnosability

The window is created hidden (`visible: false`) and shown by the frontend (`show_main_window`) when the first meaningful frame is painted. That design is correct, but it currently has failure states that strand the user, and no logging to diagnose them. These five items close every hole found.

### P1-6 · No error boundary + no escape hatch: a frontend failure = blank, unclosable window

**Why:** there is no React error boundary anywhere in `src/`. A render throw unmounts the tree before effects run, so neither `bootComplete()` nor the JS failsafe ever fires; the Rust 5 s failsafe then shows a window whose `#root` is still `visibility: hidden` — blank stripes. `decorations: false` means no OS titlebar: the user cannot close, move, or interact with the window except via Task Manager. Same terminal state if the bundle throws at module scope (see P1-8 for one concrete way).

**Changes (four layers, all cheap):**

**(a)** New file `src/components/RootErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { bootComplete } from '../lib/boot';

/**
 * Last line of defence for render throws. The window is created hidden and
 * has no OS decorations, so an unmounted tree is not "a broken page" -- it
 * is an invisible window the user cannot reach or close. This boundary
 * forces the boot hand-over (which shows the window) and renders a way out.
 */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    bootComplete();
    console.error('Fatal render error:', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          alignContent: 'center',
          gap: 12,
          background: '#0B0A09',
          color: '#F2F0ED',
          fontFamily: 'Archivo, sans-serif',
        }}
      >
        <div data-tauri-drag-region style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 36 }} />
        <div>Upscaly Studio hit an unrecoverable error.</div>
        <pre style={{ maxWidth: '80vw', overflow: 'auto', fontSize: 11, color: '#6B655E' }}>
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <button onClick={() => void invoke('close_window').catch(() => {})}>Close Upscaly Studio</button>
      </div>
    );
  }
}
```

**(b)** `src/main.tsx` — wrap `<App />` in the boundary, and add a net for non-React failures:

```tsx
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { bootComplete } from './lib/boot';

// Errors that escape React entirely (module-init throws, async listeners)
// must still hand the window over -- hidden-forever is the one forbidden state.
window.addEventListener('error', () => bootComplete());
window.addEventListener('unhandledrejection', () => bootComplete());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
```

**(c)** `index.html` — the static `#boot` overlay is what shows if the bundle never executes. Give it a drag region and a close control (the `close_window` command exists but requires the bundle; use raw internals with a guard so this works even when the bundle is dead), plus an error state on `window.onerror`:

```html
<!-- inside #boot markup -->
<div data-tauri-drag-region style="position:absolute;top:0;left:0;right:0;height:36px;-webkit-app-region:drag"></div>
<button id="boot-close" aria-label="Close"
  style="position:absolute;top:8px;right:10px;background:none;border:0;color:#6B655E;font:16px/1 'Martian Mono',monospace;cursor:pointer">✕</button>
<script>
  // Inline (CSP: move to a small /boot-escape.js file if script-src 'self'
  // rejects inline -- it will; a separate file in public/ is required).
  document.getElementById('boot-close').addEventListener('click', function () {
    var t = window.__TAURI_INTERNALS__;
    if (t && t.invoke) t.invoke('close_window').catch(function () {});
  });
  window.addEventListener('error', function () {
    var s = document.getElementById('boot-status');
    if (s) s.textContent = 'STARTUP FAILED — CLICK ✕ TO CLOSE';
  });
</script>
```

IMPORTANT for the implementer: `script-src 'self'` blocks inline scripts. Put this script in `public/boot-escape.js` and reference it `<script src="/boot-escape.js"></script>` from `index.html`. Do not weaken the CSP for it.

**(d)** `src-tauri/src/lib.rs` — second-stage failsafe: if the frontend never called `show_main_window` by 20 s, restore OS decorations so the window gets a native close button. Track the call with an `AtomicBool` in `commands/window.rs` (`pub static FRONTEND_SHOWED: AtomicBool`, set in `show_main_window`), and in the existing failsafe thread:

```rust
std::thread::sleep(std::time::Duration::from_secs(15)); // 5s (show) + 15s = 20s total
if !crate::commands::window::FRONTEND_SHOWED.load(std::sync::atomic::Ordering::SeqCst) {
    if let Some(window) = tauri::Manager::get_webview_window(&handle, "main") {
        let _ = window.set_decorations(true);
    }
}
```

**Verify:** temporarily throw in `StudioLayoutContainer`'s render; build and install; confirm the error screen appears with a working close button. Remove the throw.

### P1-7 · Failsafe ordering and the splash-arming race

**Why:** two defects. (1) The Rust failsafe shows the window at 5 s but the JS failsafe reveals `#root` at 12 s — so a slow bootstrap shows a blank striped window for up to 7 s. Rust must be the *last* resort, not the first. (2) `bootArm()` awaits `invoke('launch_elapsed_ms')` **before** arming the splash timer, so a wedged IPC (exactly what P0-1's transport degradation makes likelier) suppresses the splash entirely.

**Changes:**

`src/hooks/useSettingsSync.ts` — `BOOT_FAILSAFE_MS`: `12000` → `4000`, with a comment that it MUST stay below the Rust failsafe (5 s) in `src-tauri/src/lib.rs`, and a matching comment on the Rust side pointing back. Also hoist the failsafe clear so React StrictMode's dev-only synthetic unmount can't cancel it (the cleanup currently clears the timer and the re-run returns early on `startedRef` — meaning dev has no failsafe at all): let the bootstrap `.finally()` own the `clearTimeout`, and remove it from the effect cleanup.

`src/lib/boot.ts` — arm on the page clock first, re-aim after the IPC answer:

```ts
export async function bootArm(): Promise<void> {
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;

  const show = () => {
    revealTimer = undefined;
    if (handedOver) return;
    shownAt = performance.now();
    el.classList.add('boot-show');
    showWindow();
  };

  // Armed on the page clock before anything is awaited, so a slow or
  // wedged `launch_elapsed_ms` can never be what stops the splash from
  // ever painting.
  revealTimer = window.setTimeout(show, COLD_LAUNCH_MS);

  if (inTauri()) {
    try {
      const elapsed = await invoke<number>('launch_elapsed_ms');
      if (typeof elapsed === 'number') realSkewMs = elapsed - performance.now();
    } catch {
      // Page clock it is.
    }
  }
  if (handedOver) return;
  if (revealTimer !== undefined) {
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(show, Math.max(0, COLD_LAUNCH_MS - realNow()));
  }
}
```

**Tests:** `src/lib/__tests__/boot.test.ts` — existing 16 cases must stay green (the arming change is behavior-compatible on both clocks); add one case: `bootArm` with a never-resolving mocked invoke still reveals the splash after `COLD_LAUNCH_MS` (use `mockTauri` with a pending promise). Add one `useSettingsSync`-level or boot-level test that `bootComplete` fires via failsafe when the bootstrap promise never settles.

### P1-8 · Silent process death: `.expect()` under `windows_subsystem = "windows"`

**Why:** `run()` ends in `.build(...).expect(...)`. In release there is no console and no panic hook, so a `build()` failure (missing/corrupted WebView2 runtime — the classic "works on my machine, dead on the user's") exits with **nothing at all**: no window, no dialog, no log. This is the one scenario that exactly matches "does not even run", and it would only manifest on machines other than the dev machine.

**File:** `src-tauri/src/lib.rs` — replace the `.expect(...)` with a match that shows a native message box, and install a panic hook first. Add `windows-sys` features `Win32_UI_WindowsAndMessaging` in `src-tauri/Cargo.toml` (crate already depended on).

```rust
fn fatal_dialog(message: &str) {
    #[cfg(windows)]
    #[allow(unsafe_code)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR};
        let msg: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
        let title: Vec<u16> = "Upscaly Studio".encode_utf16().chain(std::iter::once(0)).collect();
        MessageBoxW(std::ptr::null_mut(), msg.as_ptr(), title.as_ptr(), MB_ICONERROR);
    }
}

// in run(), before Builder::default():
std::panic::set_hook(Box::new(|info| {
    fatal_dialog(&format!(
        "Upscaly Studio crashed during startup:\n\n{info}\n\nPlease report this."
    ));
}));

// and replace `.expect("error while building tauri application")`:
let app = match builder.build(tauri::generate_context!()) {
    Ok(app) => app,
    Err(e) => {
        fatal_dialog(&format!(
            "Upscaly Studio failed to start:\n\n{e}\n\nThis usually means the Microsoft Edge \
             WebView2 Runtime is missing or damaged. Reinstalling the app repairs it."
        ));
        std::process::exit(1);
    }
};
app.run(|_app_handle, event| { /* existing handler body unchanged */ });
```

**Verify:** clippy clean; simulate by temporarily renaming the WebView2 runtime dir is destructive — instead unit-verify `fatal_dialog` compiles for windows and trust the match arm; the panic hook can be verified with a deliberate `panic!` in `setup` in a throwaway build.

### P1-9 · No logging exists — every field failure is undiagnosable

**Why:** `tracing`, `tracing-appender`, `tracing-subscriber` are in `Cargo.toml` but never initialized or called; the backend's only diagnostics are two `eprintln!`s writing to a console that doesn't exist in release. There is no log file to ask a user for.

**File:** `src-tauri/src/lib.rs` — first statements of `.setup(|app| { ... })`:

```rust
let log_dir = crate::app_paths::app_data_dir(&app.handle().clone()).join("logs");
let _ = std::fs::create_dir_all(&log_dir);
let appender = tracing_appender::rolling::daily(&log_dir, "upscaly.log");
let (writer, guard) = tracing_appender::non_blocking(appender);
// The guard must outlive the process or buffered lines are lost.
app.manage(guard);
let _ = tracing_subscriber::fmt()
    .with_writer(writer)
    .with_ansi(false)
    .try_init();
tracing::info!(version = env!("CARGO_PKG_VERSION"), "upscaly starting");
```

Convert the two `eprintln!`s (`engine/model_store.rs`, `image_batch.rs`) to `tracing::warn!`, and add `tracing::warn!` to the swallowed errors on the sidecar/provisioning paths (`sidecar_manager.rs` probe failures, `model_manager.rs` download errors). Log retention: add a startup sweep deleting files in `logs/` older than 14 days.

**Verify:** install, launch, confirm `%APPDATA%\com.wexpa.upscaly\logs\upscaly.log.<date>` exists and contains the startup line.

### P1-10 · ffmpeg's promised recovery path does not exist

**Why:** the installer hook ignores provisioning failure because "the app re-offers the download when a video job is started" — and the provision script tells the user the same. **No such code exists.** On any machine where the install-time fetch failed (offline, proxy, GitHub blocked), video upscaling is permanently broken with a raw `SidecarNotFound` error and no remediation short of reinstalling.

**Changes:**

**(a)** New command in `src-tauri/src/commands/` (e.g. `sidecars.rs`, registered in `lib.rs`):

```rust
use tauri::{AppHandle, Manager, path::BaseDirectory};

/// Runs the same provisioning script the installer runs, on demand.
/// Exists because the installer deliberately tolerates a failed fetch
/// (offline install), and the app promises to re-offer the download when
/// a video job needs it.
#[tauri::command]
pub async fn provision_ffmpeg(app: AppHandle) -> Result<(), String> {
    let script = app
        .path()
        .resolve("resources/provision-ffmpeg.ps1", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let install_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("no exe dir")?
        .to_path_buf();
    let output = tokio::process::Command::new("powershell.exe")
        .args([
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", &script.to_string_lossy(),
            "-InstallDir", &install_dir.to_string_lossy(),
        ])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .await
        .map_err(|e| format!("Failed to run provisioning: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "ffmpeg download failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}
```

(Match the crate's existing pattern for hiding consoles — `process_runner` has a helper; use it instead of the raw flag if present.)

**(b)** Frontend: when a video job fails with the ffmpeg `SidecarNotFound` error (match on the error string or add a typed code), show a notification with an action: "Video components missing — Download (~290 MB)?" that calls `invoke('provision_ffmpeg')` with a progress toast, then retries enablement. Minimal placement: in `src/store/studioCommands.ts` `startUpscale`'s video path, pre-check via a new lightweight `invoke('ffmpeg_available')` command (`resolve_ffmpeg_binary().is_ok()`) and offer provisioning before submitting the job.

**Verify:** rename `$INSTDIR\binaries\ffmpeg-*.exe` away on an installed build, start a video job, confirm the offer appears, provisioning runs, and the job can start afterwards.

### P1-11 · Guard the module-scope `localStorage` read

**Why:** `src/store/studioStore.ts` reads `localStorage.getItem('upscaly_sound_muted')` bare at module init. If storage access throws (WebView2 policy or corrupted profile), the whole bundle dies at top level → the P1-6 blank-window state, and even the error boundary can't catch it (it's pre-React).

**File:** `src/store/studioStore.ts`:

```ts
function readMutedPreference(): boolean {
  try {
    return localStorage.getItem('upscaly_sound_muted') === 'true';
  } catch {
    return false;
  }
}
// initial state:
isMuted: readMutedPreference(),
```

Also wrap the `setItem` in the mute action in the same try/catch pattern (`src/lib/history.ts` already does this everywhere — mirror it).

---

## P2 — Correctness, polish, hygiene

### P2-12 · Product name: runtime, not hardcoded (currently wrong in BOTH builds)

The release titlebar says "Upscaly" (hardcoded in `src/components/titlebar/WindowControls.tsx`, the brand `<span>`) and the dev splash says "Upscaly Studio" (hardcoded in `index.html`'s `boot-name` div) — both inverted. Fix by reading Tauri's own metadata:

- `src/lib/updater.ts`: extend `loadAppVersion()` into `loadAppIdentity()` using `getName()` + `getVersion()` from `@tauri-apps/api/app` (both permitted under `core:default`), storing into a new `appName` store field alongside `appVersion`; update the `useSettingsSync` call site.
- `src/store/studioStore.ts` / `src/store/selectors.ts`: add `appName` field, `setAppName` action, `useAppName` selector (mirror the `appVersion` trio).
- `WindowControls.tsx`: `const appName = useAppName();` → `<span …>{appName || 'Upscaly'}</span>` (fallback keeps the existing Titlebar test green under jsdom).
- `src/lib/boot.ts`: add `bootName(name)` that sets `#boot .boot-name` textContent if not handed over; call from `loadAppIdentity()`. Change `index.html`'s hardcoded `boot-name` to `Upscaly` (the neutral shared prefix) so the pre-bundle frame is never *wrong*, just shorter.
- Sweep remaining stale strings to "Upscaly Studio" where they name the product: `index.html` `<title>`, `src/components/UpdateBadge.tsx` (3 sites), `src/lib/updater.ts` toast text, `src/components/AboutModal.tsx`, `src-tauri/installer-hooks.nsh` `DetailPrint`. Leave the GitHub repo URL `shayann07/Upscaly` untouched everywhere — the repo was not renamed and the updater endpoint depends on it.

### P2-13 · `font-display` conflict for the splash fonts

`index.html` declares the two `/fonts/*.woff2` faces with `font-display: block`; `src/index.css` declares the same faces with `swap`. The effective value flips mid-startup when the bundle CSS loads. **Make both `block`** — the files are local and same-origin (sub-frame load; the 3 s block window is never observed), and `swap` would reintroduce the splash-wordmark FOUT the inline declaration exists to prevent. Change `src/index.css` lines for both faces and add a cross-reference comment in both files stating they must stay identical.

### P2-14 · GPU probe crashes the engine twice per launch (Windows Error Reporting spam)

Every launch with an empty models dir spawns `realesrgan-ncnn-vulkan.exe` for GPU enumeration; it aborts with `0xc0000409` and writes two Application-log crash events. Functionally handled (output parsed regardless of exit) but unacceptable noise for prod — a user checking Event Viewer sees the app "crashing" on every launch, and WER may eventually show dialogs. Proper fix: enumerate Vulkan devices natively in Rust and stop spawning the engine for probing:

- Add `ash = "0.38"` to `src-tauri/Cargo.toml`.
- New function in `sidecar_manager.rs`: create a Vulkan instance via `ash::Entry::load()`, `enumerate_physical_devices()`, map `vkGetPhysicalDeviceProperties` name/type into the existing `GpuInfo` shape with the same indices the engine would report (both enumerate in Vulkan physical-device order, so indices agree; keep the engine-output parser as fallback if `ash` fails to load a Vulkan loader).
- Keep the existing cache file behavior. Engine probe path stays as fallback only.

This also removes ~5 s from the first-launch critical path (the probe's engine-crash timeout).

### P2-15 · Models and GPU cache land in Roaming AppData

`app_data_dir()` is `%APPDATA%` (Roaming). Model weights (34–67 MB each) and `gpu_cache.json` are machine-local artifacts and belong in `%LOCALAPPDATA%`; on roaming-profile machines they sync on every logon. Add `app_local_data_dir()` to `src-tauri/src/app_paths.rs` (same `debug_suffixed` treatment), route `model_manager::get_models_dir` and the GPU cache path through it, and on first run move an existing `models/` dir from the roaming location if present (one-time, `std::fs::rename` with copy fallback). Keep `settings.json`/`history.json` roaming — small and should follow the user.

### P2-16 · Compile the CWD-relative sidecar fallbacks out of release

`sidecar_manager.rs` falls back to `.\binaries\<exe>` and `.\src-tauri\binaries\<exe>` relative to the process CWD. In an installed app this is a binary-planting vector (CWD is attacker-influenced via "Open with", shortcut tampering). Wrap the four CWD-relative probe paths in `#[cfg(debug_assertions)]` — they exist only for the dev tree.

### P2-17 · Harden `provision-ffmpeg.ps1`

Before the download: `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12` (old PS 5.1 defaults get rejected by GitHub) and add `-TimeoutSec 900` to both `Invoke-WebRequest` calls (a stalled connection currently hangs the installer forever with no cancel). Also correct the script's failure message and `installer-hooks.nsh`'s comment once P1-10 lands (the promise becomes true).

### P2-18 · CI/workflow hygiene

- `scripts/fetch-sidecars.mjs`: add a positional package-name filter (`node scripts/fetch-sidecars.mjs realesrgan-ncnn-vulkan vcredist`) and use it in `release.yml` — the release runner currently downloads ~290 MB of ffmpeg that is never bundled, and the workflow comment claims it doesn't. Correct the comment.
- `ci.yml`: fix the stale comment claiming three `externalBin` entries (there is one).
- `.gitignore`: add `.claude/*` + `!.claude/launch.json` (keep the launch config shareable, exclude machine-local lock state).
- `sidecar-manifest.json`: drop the `vcomp140d.dll` (debug CRT) entry — fetched, tracked, shipped to nobody.
- `src/hooks/useSettingsSync.ts`: move the `BOOT_FAILSAFE_MS` const below the import block (valid ESM today, but reads as an accident and trips `import/first` if ever enabled).
- `src-tauri/src/app_paths.rs`: change the `unwrap_or_else(|_| PathBuf::from("."))` fallbacks to `std::env::temp_dir().join("upscaly")` — "." in an installed app is `$INSTDIR`, where the uninstaller would delete user data.

### P2-19 · Model picker: show what's not installed (optional UX, ask the user first)

The quick model picker lists the full catalog with no indication of install state; with zero models installed it looks fully stocked (the checkmark means *selected*, not *downloaded*). If the user approves: in the picker option rows (`SettingsPanel`/`CustomSelect` usage), for models absent from `installedModels`, render the model's download size in the muted mono style (e.g. `34 MB`) where installed entries show nothing. Data is already available (`supportedModels[i].size`, `installedModels`).

### P2-20 · Code signing (known gap — budget item, not a code change)

The minisign key signs updater payloads only; the installer and exe are not Authenticode-signed. Every user gets SmartScreen "unrecognized app," and cold-start Defender scans of unsigned binaries are the main remaining startup-latency source. Options: OV certificate (~$100–400/yr, reputation builds over time) or EV (~$300–700/yr, instant SmartScreen reputation, requires hardware token/cloud HSM — Azure Trusted Signing at ~$9.99/mo is the current best value for individual devs, needs a 3-year-old tax-registered entity, or SignPath/Certum for open-source). When acquired: add `signCommand` under `bundle.windows` in `tauri.conf.json` and sign in CI. Until then, this is the accepted cost of shipping unsigned.

---

## Ship checklist (ordered)

1. Implement P0-1 … P0-5, P1-6 … P1-11 (P2 items can follow in a patch release; P2-12/13 are cheap enough to include now).
2. Run the full gate locally: `npm run check:quality` (tsc, eslint, vitest, clippy, formatters) — all green, no warnings.
3. Build BOTH bundles locally: `npm run tauri:build` and `npm run tauri:build:dev`. The dev build must complete with no signing error (P0-4). Install each; verify: window appears, previews render (drop an image), model download shows one continuous progress sweep, debug app reports updates unavailable.
4. Commit everything as one reviewed PR to `main`. **The user has an explicit standing gate: ask permission before any push to GitHub.** Suggested commit structure: (1) release pipeline fixes, (2) startup resilience, (3) polish sweep.
5. After merge, CI (`release.yml`) publishes v1.0.1: tag, signed updater artifact, `latest.json`, renamed asset.
6. Verify the release: download `latest.json`, `curl -sIL` the asset URL → 200; fresh-install the released asset on a clean VM or the dev machine.
7. Test the update hop: install v0.1.0 from the old release, launch, accept the update prompt; confirm the P0-3 cleanup removed the old install and 1.0.1 runs.
8. Post-release: watch the first real launch's `logs/upscaly.log.*` (P1-9) for warnings.

## Decisions made in this plan (flag to the user if any should change)

- **Keep** `productName: "Upscaly Studio"` + space-free renamed release asset (P0-2), rather than renaming the product.
- **No data migration** for the 0.1.0 → 1.0.1 identity change; old install is uninstalled by hook, old app data orphaned (P0-3). Rationale: zero real users on 0.1.0.
- `font-display: block` in both declarations (P2-13).
- Native Vulkan probe via `ash` rather than living with the WER spam (P2-14).
- Code signing deferred but documented (P2-20).

## Verified sound (do not "fix" these)

The audits explicitly verified the following as correct — an implementing agent should not touch them: window label defaults to "main" (capability binding valid); the hidden-window show flow is coherent end-to-end with idempotent `showWindow`; installed sidecar/resource layout (triple-stripped engine exe, `vcomp140.dll` placement, manifest path, provision script path); NSIS `$INSTDIR` recovery in PREUNINSTALL and the `$UpdateMode` guard; provisioning idempotency (hash-based); process reaping via job objects on every exit path; version consistency across `package.json`/`tauri.conf.json`/`Cargo.toml`/`Cargo.lock` (all 1.0.1, maintained by `scripts/version-set.mjs`); updater manifest shape (`windows-x86_64`) and endpoint; encoder fallback ladder ending in software (`libx264`/`mpeg4`); `.gitattributes` binary coverage; every frontend `invoke()` call site is error-guarded; asset-scope grants are awaited before render; CSP asset/media entries; `import.meta.env.DEV` usage (both sites correct); `localStorage` as non-durable cache with backend as source of truth.

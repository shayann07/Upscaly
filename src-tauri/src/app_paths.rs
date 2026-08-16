//! Single place every module gets its data/cache directory from, instead of
//! calling `app.path().app_data_dir()` / `app_cache_dir()` directly.
//!
//! The primary dev/prod split is `tauri.dev.conf.json`, merged in via
//! `tauri dev --config src-tauri/tauri.dev.conf.json` (see `npm run
//! tauri:dev`), which compiles a different `identifier` into the debug
//! binary so Tauri itself resolves an entirely separate `app_data_dir` /
//! `app_cache_dir` -- and, since the `WebView2` profile directory is also
//! derived from the identifier, an entirely separate `WebView2` profile too.
//!
//! That merge happens at build time, through the tauri-cli. A debug binary
//! built by calling `cargo build` directly (skipping the CLI, e.g. from an
//! IDE's "just run it" button) never passes through that merge, and would
//! resolve the *production* identifier while still being a debug build --
//! landing in the exact directory the installed release app uses. This
//! module is the backstop for that path: it appends a `debug` segment
//! whenever `cfg!(debug_assertions)` is true, regardless of which
//! identifier got compiled in, so a debug build can never share a
//! directory with a release build no matter how it was launched.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn debug_suffixed(mut dir: PathBuf) -> PathBuf {
    if cfg!(debug_assertions) {
        dir = dir.join("debug");
    }
    dir
}

/// Replaces `app.path().app_data_dir()`. Settings, history, the GPU
/// detection cache and installed model weights all live under this.
pub fn app_data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    debug_suffixed(dir)
}

/// Replaces `app.path().app_cache_dir()`. Per-job video/batch staging
/// directories live under this; everything in it is disposable.
pub fn app_cache_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    debug_suffixed(dir)
}

#[cfg(test)]
mod tests {
    use super::debug_suffixed;
    use std::path::PathBuf;

    #[test]
    fn test_debug_suffix_matches_the_build_profile() {
        let base = PathBuf::from("C:\\Users\\test\\AppData\\Roaming\\com.shaya.ai-upscaler");
        let result = debug_suffixed(base.clone());
        if cfg!(debug_assertions) {
            assert_eq!(result, base.join("debug"));
        } else {
            assert_eq!(result, base);
        }
    }
}

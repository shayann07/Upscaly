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

/// Replaces `app.path().app_data_dir()`. Settings, history, and application
/// logs live under this (Roaming %APPDATA%).
pub fn app_data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("upscaly"));
    debug_suffixed(dir)
}

/// Replaces `app.path().app_local_data_dir()`. Machine-local data like model
/// weights and GPU cache live under %LOCALAPPDATA% so they do not sync across
/// roaming profiles.
pub fn app_local_data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("upscaly"));
    debug_suffixed(dir)
}

/// Replaces `app.path().app_cache_dir()`. Per-job video/batch staging
/// directories live under this; everything in it is disposable.
///
/// Honours the `scratch_dir` setting when one is configured. A 4x video job
/// keeps every upscaled PNG frame resident until reassembly, which runs to
/// tens of GB -- a 1080p clip of a couple of thousand frames needs ~83 GB.
/// The platform cache directory is on the system drive, which on a laptop is
/// routinely the *smallest* volume, so the job is refused for want of space
/// while a data drive sits empty. Letting the user point staging at that
/// drive is the difference between the feature working and not.
///
/// A configured directory that cannot be created is ignored rather than
/// fatal: a path can go missing with an unplugged drive, and falling back to
/// the platform default degrades to "works, but might be short on space"
/// instead of "every video job fails until you visit Settings".
pub fn app_cache_dir(app: &AppHandle) -> PathBuf {
    if let Some(dir) = configured_scratch_dir(app) {
        return dir;
    }
    let dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("upscaly"));
    debug_suffixed(dir)
}

/// The user's chosen staging root, if set, usable, and writable.
///
/// Debug-suffixed like every other path here, so a debug build pointed at
/// the same folder as the release one still cannot share its staging.
fn configured_scratch_dir(app: &AppHandle) -> Option<PathBuf> {
    let configured = crate::settings::load_settings(app).scratch_dir?;
    let trimmed = configured.trim();
    if trimmed.is_empty() {
        return None;
    }

    let dir = debug_suffixed(PathBuf::from(trimmed).join("UpscalyScratch"));
    // Create eagerly: an unwritable or vanished path has to fall back now,
    // not fail later with the staging directory half-built.
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

#[cfg(test)]
mod tests {
    use super::debug_suffixed;
    use std::path::PathBuf;

    #[test]
    fn test_debug_suffix_matches_the_build_profile() {
        let base = PathBuf::from("C:\\Users\\test\\AppData\\Roaming\\com.wexpa.upscaly");
        let result = debug_suffixed(base.clone());
        if cfg!(debug_assertions) {
            assert_eq!(result, base.join("debug"));
        } else {
            assert_eq!(result, base);
        }
    }
}

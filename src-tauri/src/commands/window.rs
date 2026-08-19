//! The window's first appearance is owned by the frontend, not the backend.
//!
//! The window is created hidden (`visible: false` in tauri.conf.json).
//! Anything the backend could key on -- window creation, page load -- fires
//! before the frontend has painted what the user should actually see, so
//! showing the window from here always risked a frame of the wrong thing:
//! a flat fill before the first paint, a bare striped page before the
//! splash, a half-built dashboard before hand-over. Only the frontend
//! knows when the first frame worth looking at exists, so it calls
//! [`show_main_window`] at that moment and the window opens already
//! painted.

use std::sync::atomic::{AtomicBool, Ordering};

pub static FRONTEND_SHOWED: AtomicBool = AtomicBool::new(false);

/// Puts the (hidden) main window on screen. Idempotent; showing a shown
/// window is a no-op.
#[tauri::command]
pub async fn show_main_window(window: tauri::WebviewWindow) {
    FRONTEND_SHOWED.store(true, Ordering::SeqCst);
    let _ = window.show();
    let _ = window.set_focus();
}

/// Real time since the process entered `run`, in milliseconds.
///
/// The frontend cannot measure this itself: `performance.now()` starts at
/// *navigation*, and the expensive part of a cold launch -- process spawn,
/// `WebView2` runtime init -- is spent before navigation begins. Judged by
/// the page clock alone, every launch looks warm, which is exactly how the
/// splash ended up never showing on the launches that needed it.
#[tauri::command]
pub async fn launch_elapsed_ms() -> u64 {
    // Saturating: a launch old enough to overflow u64 milliseconds is not
    // a real launch, but it should not panic either.
    u64::try_from(crate::launched_at().elapsed().as_millis()).unwrap_or(u64::MAX)
}

/// Whether this binary was compiled with debug assertions. The frontend's
/// `import.meta.env.DEV` cannot answer this: `tauri build --debug` runs a
/// production Vite build, so DEV is false inside a debug bundle.
#[tauri::command]
pub async fn is_debug_build() -> bool {
    cfg!(debug_assertions)
}

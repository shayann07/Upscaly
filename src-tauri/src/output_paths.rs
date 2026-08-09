use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static RESERVED_PATHS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn get_reserved_paths() -> &'static Mutex<HashSet<String>> {
    RESERVED_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Safe helper to acquire lock even if poisoned
fn safe_lock_reserved() -> std::sync::MutexGuard<'static, HashSet<String>> {
    get_reserved_paths()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Reserves a unique output path prior to job enqueueing, avoiding filename collisions.
pub fn reserve_output_path(raw_path: &str, scale: u32) -> String {
    let mut reserved = safe_lock_reserved();
    let original = PathBuf::from(raw_path);
    let parent = original.parent().unwrap_or_else(|| Path::new("."));
    let stem = original
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let ext = original
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");

    let mut candidate = original.to_string_lossy().to_string();
    let mut counter = 1;

    let target_scale = if scale == 0 { 4 } else { scale };

    while Path::new(&candidate).exists() || reserved.contains(&candidate) {
        let new_name = format!("{}_{}x ({}).{}", stem, target_scale, counter, ext);
        candidate = parent.join(new_name).to_string_lossy().to_string();
        counter += 1;
    }

    reserved.insert(candidate.clone());
    candidate
}

pub fn release_output_path(path: &str) {
    let mut reserved = safe_lock_reserved();
    reserved.remove(path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_path_reservation_uniqueness() {
        let path1 = reserve_output_path("test_image.png", 4);
        let path2 = reserve_output_path("test_image.png", 4);
        let path3 = reserve_output_path("test_image.png", 2);

        assert_ne!(path1, path2);
        assert!(path2.contains("_4x (1)"));
        assert!(path3.contains("_2x (1)") || path3.contains("_2x"));

        release_output_path(&path1);
        release_output_path(&path2);
        release_output_path(&path3);
    }
}

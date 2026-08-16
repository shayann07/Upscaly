use crate::error::AppError;
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
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Builds the output path for a job.
///
/// The single definition of how an upscale is named. The frontend used to
/// compute this itself and pass the result in, which meant two naming schemes
/// that disagreed on collision: the frontend produced
/// `foo_upscaled_4x.png`, then the reservation below appended its own scale
/// suffix to that whole stem, yielding `foo_upscaled_4x_4x (1).png`.
///
/// `output_dir` is the user's chosen destination; when absent or empty the
/// output lands alongside its input.
#[must_use]
pub fn build_output_path(
    input_path: &str,
    is_video: bool,
    scale: u32,
    output_dir: Option<&str>,
    format: crate::engine::output_format::OutputFormat,
) -> String {
    let input = Path::new(input_path);
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media");
    // Video is always MP4; the chosen image format has nothing to say about
    // it, and letting it name a video `.webp` would produce a file no
    // player would open.
    let ext = if is_video { "mp4" } else { format.extension() };
    let target_scale = if scale == 0 { 4 } else { scale };

    let dir = output_dir
        .filter(|d| !d.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| input.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));

    dir.join(format!("{stem}_upscaled_{target_scale}x.{ext}"))
        .to_string_lossy()
        .to_string()
}

/// Makes sure the directory an output will be written to exists.
///
/// The output directory is a free-text field, so it can name a folder that
/// simply is not there -- and nothing downstream notices until the very
/// last step. A video job discovers it after every frame has been upscaled:
/// ffmpeg opens the output, gets "No such file or directory", and an hour
/// of GPU work is thrown away over a folder that takes a millisecond to
/// create. Observed exactly that way on a 294-frame job writing to a
/// `Batch3` directory that had never been created.
///
/// Creating it is the right behaviour rather than merely failing early: a
/// user who types a destination is asking for output to go there, and
/// `mkdir -p` is what every other tool does with that instruction. The
/// error path remains for the cases creation genuinely cannot fix --
/// permissions, a missing drive, a file where the directory should be --
/// and those now surface at submission, in seconds, instead of at the end.
pub fn ensure_output_dir(path: &str) -> Result<(), AppError> {
    let Some(parent) = Path::new(path).parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() || parent.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(parent).map_err(|e| AppError::OutputPathUnusable {
        message: format!(
            "Cannot write to the output folder '{}': {e}",
            parent.display()
        ),
    })
}

/// Reserves a unique output path prior to job enqueueing, avoiding filename
/// collisions with files on disk and with other in-flight jobs.
///
/// Disambiguates with a plain ` (n)` counter. The scale is already part of the
/// name from [`build_output_path`], so re-encoding it here is what produced
/// the doubled `_4x_4x` suffix.
pub fn reserve_output_path(raw_path: &str) -> String {
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

    while Path::new(&candidate).exists() || reserved.contains(&candidate) {
        let new_name = format!("{stem} ({counter}).{ext}");
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
    use crate::engine::output_format::OutputFormat;

    #[test]
    fn test_output_path_reservation_uniqueness() {
        let path1 = reserve_output_path("test_image.png");
        let path2 = reserve_output_path("test_image.png");

        assert_ne!(path1, path2);
        assert!(path2.contains("test_image (1)"));

        release_output_path(&path1);
        release_output_path(&path2);
    }

    #[test]
    fn test_reservation_does_not_double_up_the_scale_suffix() {
        // build_output_path already puts the scale in the name. The counter
        // must only add " (n)" -- the old code re-appended the scale to the
        // whole stem, producing foo_upscaled_4x_4x (1).png.
        let first = reserve_output_path("clip_upscaled_4x.mp4");
        let second = reserve_output_path("clip_upscaled_4x.mp4");

        assert_eq!(second.matches("_4x").count(), 1);
        assert!(second.contains("clip_upscaled_4x (1).mp4"));

        release_output_path(&first);
        release_output_path(&second);
    }

    #[test]
    fn test_build_output_path_names_and_places_the_output() {
        let alongside = build_output_path("C:\\media\\clip.mkv", true, 2, None, OutputFormat::Png);
        assert!(alongside.ends_with("clip_upscaled_2x.mp4"));
        assert!(alongside.starts_with("C:\\media"));

        // Images take the chosen format regardless of source container.
        let image = build_output_path("C:\\media\\shot.jpeg", false, 4, None, OutputFormat::Png);
        assert!(image.ends_with("shot_upscaled_4x.png"));

        // A chosen destination wins over the input's directory.
        let custom = build_output_path(
            "C:\\media\\clip.mkv",
            true,
            3,
            Some("D:\\out"),
            OutputFormat::Png,
        );
        assert!(custom.starts_with("D:\\out"));
        assert!(custom.ends_with("clip_upscaled_3x.mp4"));

        // Blank is treated as "not chosen", not as a relative directory.
        let blank = build_output_path(
            "C:\\media\\clip.mkv",
            true,
            4,
            Some("   "),
            OutputFormat::Png,
        );
        assert!(blank.starts_with("C:\\media"));

        // AUTO scale (0) records as the 4x default it actually runs at.
        let auto = build_output_path("C:\\media\\clip.mkv", true, 0, None, OutputFormat::Png);
        assert!(auto.ends_with("clip_upscaled_4x.mp4"));
    }

    #[test]
    fn test_a_missing_output_folder_is_created_rather_than_failing_late() {
        // The bug this closes cost a real 294-frame job: the destination
        // folder did not exist, nothing checked, and ffmpeg only discovered
        // it when opening the output after ~50 minutes of GPU work.
        let root = std::env::temp_dir().join("upscaly_outdir_test");
        let _ = std::fs::remove_dir_all(&root);
        let nested = root.join("Batch3").join("deeper");
        let target = nested.join("clip_upscaled_4x.mp4");

        assert!(!nested.exists());
        ensure_output_dir(&target.to_string_lossy()).expect("should create the folder");
        assert!(nested.is_dir(), "the whole chain must be created");

        // Idempotent: an existing folder is not an error.
        ensure_output_dir(&target.to_string_lossy()).expect("existing folder is fine");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_a_file_where_the_folder_should_be_is_reported_not_ignored() {
        // create_dir_all cannot fix this one, and silently continuing would
        // reproduce the original failure at the end of the run.
        let root = std::env::temp_dir().join("upscaly_outdir_conflict");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let blocker = root.join("not_a_dir");
        std::fs::write(&blocker, b"x").unwrap();

        let target = blocker.join("clip_upscaled_4x.mp4");
        let err = ensure_output_dir(&target.to_string_lossy());
        assert!(err.is_err(), "a file blocking the path must be reported");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_the_chosen_format_names_images_but_never_video() {
        for (format, ext) in [
            (OutputFormat::Png, "png"),
            (OutputFormat::Jpg, "jpg"),
            (OutputFormat::Webp, "webp"),
        ] {
            let image = build_output_path("C:\\media\\shot.tif", false, 4, None, format);
            assert!(
                image.ends_with(&format!("shot_upscaled_4x.{ext}")),
                "{image}"
            );

            // Video is always MP4. Naming an H.264 file ".webp" because the
            // image format happened to be set to WEBP would produce
            // something no player would open.
            let video = build_output_path("C:\\media\\clip.mkv", true, 4, None, format);
            assert!(video.ends_with("clip_upscaled_4x.mp4"), "{video}");
        }
    }
}

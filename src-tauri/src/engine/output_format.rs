//! The container an upscaled image is written to.
//!
//! Applies to images only. Video output is always MP4 -- the frame format
//! inside the pipeline is a separate matter and is always lossless (see
//! `video_pipeline::phases`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    /// Lossless. The default, and the only one that returns exactly what the
    /// model produced.
    #[default]
    Png,
    /// Lossy, and the reason this enum has a warning attached to it in the
    /// UI: choosing it discards part of the detail the upscale just spent
    /// minutes producing. Offered because a 4x PNG of a large photo can be
    /// 30 MB or more, which is genuinely unusable for some purposes.
    Jpg,
    /// Lossy, but materially better than JPEG at the same size, and with
    /// alpha support PNG has and JPEG does not.
    Webp,
}

impl OutputFormat {
    /// The file extension, which is also the token `realesrgan-ncnn-vulkan`
    /// expects after `-f`.
    #[must_use]
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpg => "jpg",
            Self::Webp => "webp",
        }
    }

    /// Whether writing in this format loses information the model produced.
    #[must_use]
    pub fn is_lossy(self) -> bool {
        !matches!(self, Self::Png)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_png_is_the_default_and_the_only_lossless_one() {
        // The default has to be the lossless one: it is what every user who
        // never opens the settings panel gets, and silently re-encoding a
        // finished upscale is the exact failure this whole line of work
        // started from.
        assert_eq!(OutputFormat::default(), OutputFormat::Png);
        assert!(!OutputFormat::Png.is_lossy());
        assert!(OutputFormat::Jpg.is_lossy());
        assert!(OutputFormat::Webp.is_lossy());
    }

    #[test]
    fn test_extension_matches_the_engine_format_token() {
        // These are the same string in two roles -- the file extension and
        // the argument to `-f`. If they ever diverged the batch path would
        // look for an output file the engine never wrote.
        assert_eq!(OutputFormat::Png.extension(), "png");
        assert_eq!(OutputFormat::Jpg.extension(), "jpg");
        assert_eq!(OutputFormat::Webp.extension(), "webp");
    }

    #[test]
    fn test_format_survives_a_json_roundtrip() {
        for format in [OutputFormat::Png, OutputFormat::Jpg, OutputFormat::Webp] {
            let json = serde_json::to_string(&format).unwrap();
            assert_eq!(serde_json::from_str::<OutputFormat>(&json).unwrap(), format);
        }
        assert_eq!(
            serde_json::from_str::<OutputFormat>("\"webp\"").unwrap(),
            OutputFormat::Webp
        );
    }
}

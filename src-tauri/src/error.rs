use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Sidecar binary not found at '{path}'")]
    SidecarNotFound { path: String },

    #[error("Vulkan GPU initialization failed: {message}")]
    GpuError { message: String },

    #[error("Insufficient disk space on target drive: {required_mb}MB required")]
    InsufficientStorage { required_mb: u64 },

    #[error("Invalid media file format: {reason}")]
    InvalidFileFormat { reason: String },

    /// The destination folder cannot be written to and could not be created.
    #[error("{message}")]
    OutputPathUnusable { message: String },

    #[error("Network error: {message}")]
    NetworkError { message: String },

    #[error("Process execution error: {message}")]
    ExecutionError { message: String },

    /// A job stopped because the user asked it to.
    ///
    /// This used to be the string `"cancelled"` returned as an ordinary
    /// error and compared by value at the top of the queue worker -- control
    /// flow encoded in a message, which any rewording of that message (or a
    /// new call site spelling it differently) would have silently broken
    /// into "the job failed" instead.
    #[error("Job cancelled")]
    Cancelled,
}

/// The wire shape of an [`AppError`].
///
/// Exists as a real struct rather than a hand-rolled `serialize_struct` call
/// so the TypeScript definition can be generated from it like every other
/// IPC type, instead of being restated by hand on the other side and left to
/// drift.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct AppErrorPayload {
    /// Stable machine-readable discriminant. The frontend switches on this;
    /// `message` is for humans and may be reworded freely.
    pub code: String,
    pub message: String,
    pub suggestion: String,
}

impl AppError {
    /// Shorthand for the most common case: something a child process, the
    /// filesystem, or a pipeline step reported going wrong.
    pub fn exec(message: impl Into<String>) -> Self {
        AppError::ExecutionError {
            message: message.into(),
        }
    }

    /// Whether this is a user-requested stop rather than a real failure.
    pub fn is_cancellation(&self) -> bool {
        matches!(self, AppError::Cancelled)
    }

    pub fn to_payload(&self) -> AppErrorPayload {
        let (code, message, suggestion) = match self {
            AppError::SidecarNotFound { path } => (
                "SIDECAR_NOT_FOUND",
                self.to_string(),
                format!("Verify binary path: {path}"),
            ),
            AppError::GpuError { message } => (
                "GPU_ERROR",
                message.clone(),
                "Select a different GPU or check Vulkan drivers".to_string(),
            ),
            AppError::InsufficientStorage { required_mb } => (
                "INSUFFICIENT_STORAGE",
                self.to_string(),
                format!("Free up at least {required_mb}MB of space on target drive"),
            ),
            AppError::InvalidFileFormat { reason } => (
                "INVALID_FILE_FORMAT",
                reason.clone(),
                "Use supported formats (PNG, JPG, WEBP, MP4, MKV)".to_string(),
            ),
            AppError::OutputPathUnusable { message } => (
                "OUTPUT_PATH_UNUSABLE",
                message.clone(),
                "Choose a different output folder in Settings".to_string(),
            ),
            AppError::NetworkError { message } => (
                "NETWORK_ERROR",
                message.clone(),
                "Check internet connection and try again".to_string(),
            ),
            AppError::ExecutionError { message } => (
                "EXECUTION_ERROR",
                message.clone(),
                "Try lowering Tile Size in Advanced Settings".to_string(),
            ),
            AppError::Cancelled => (
                "CANCELLED",
                "Upscaling cancelled".to_string(),
                "Job stopped by user".to_string(),
            ),
        };
        AppErrorPayload {
            code: code.to_string(),
            message,
            suggestion,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_payload().serialize(serializer)
    }
}

/// Any I/O failure is an execution failure as far as the UI is concerned.
/// Having the conversion means pipeline code can use `?` on `std::fs` calls
/// instead of restating the same `map_err` at every call site.
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::exec(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_serialization() {
        let err = AppError::SidecarNotFound {
            path: "realesrgan.exe".into(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("SIDECAR_NOT_FOUND"));
        assert!(json.contains("realesrgan.exe"));

        let gpu_err = AppError::GpuError {
            message: "Device 0 lost".into(),
        };
        let json_gpu = serde_json::to_string(&gpu_err).unwrap();
        assert!(json_gpu.contains("GPU_ERROR"));
    }

    #[test]
    fn test_every_variant_serializes_all_three_fields() {
        let variants = [
            AppError::SidecarNotFound { path: "p".into() },
            AppError::GpuError {
                message: "g".into(),
            },
            AppError::InsufficientStorage { required_mb: 512 },
            AppError::InvalidFileFormat { reason: "r".into() },
            AppError::NetworkError {
                message: "n".into(),
            },
            AppError::ExecutionError {
                message: "e".into(),
            },
            AppError::Cancelled,
        ];
        for err in &variants {
            let payload = err.to_payload();
            assert!(!payload.code.is_empty());
            assert!(!payload.message.is_empty());
            assert!(!payload.suggestion.is_empty());
        }
    }

    #[test]
    fn test_cancellation_is_recognisable_without_matching_on_a_message() {
        assert!(AppError::Cancelled.is_cancellation());
        assert!(!AppError::exec("cancelled").is_cancellation());
    }
}

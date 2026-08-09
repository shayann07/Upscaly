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

    #[error("Network error: {message}")]
    NetworkError { message: String },

    #[error("Process execution error: {message}")]
    ExecutionError { message: String },

    #[error("Job cancelled")]
    Cancelled,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 3)?;
        match self {
            AppError::SidecarNotFound { path } => {
                state.serialize_field("code", "SIDECAR_NOT_FOUND")?;
                state.serialize_field("message", &self.to_string())?;
                state.serialize_field("suggestion", &format!("Verify binary path: {}", path))?;
            }
            AppError::GpuError { message } => {
                state.serialize_field("code", "GPU_ERROR")?;
                state.serialize_field("message", message)?;
                state.serialize_field(
                    "suggestion",
                    "Select a different GPU or check Vulkan drivers",
                )?;
            }
            AppError::InsufficientStorage { required_mb } => {
                state.serialize_field("code", "INSUFFICIENT_STORAGE")?;
                state.serialize_field("message", &self.to_string())?;
                state.serialize_field(
                    "suggestion",
                    &format!(
                        "Free up at least {}MB of space on target drive",
                        required_mb
                    ),
                )?;
            }
            AppError::InvalidFileFormat { reason } => {
                state.serialize_field("code", "INVALID_FILE_FORMAT")?;
                state.serialize_field("message", reason)?;
                state.serialize_field(
                    "suggestion",
                    "Use supported formats (PNG, JPG, WEBP, MP4, MKV)",
                )?;
            }
            AppError::NetworkError { message } => {
                state.serialize_field("code", "NETWORK_ERROR")?;
                state.serialize_field("message", message)?;
                state.serialize_field("suggestion", "Check internet connection and try again")?;
            }
            AppError::ExecutionError { message } => {
                state.serialize_field("code", "EXECUTION_ERROR")?;
                state.serialize_field("message", message)?;
                state
                    .serialize_field("suggestion", "Try lowering Tile Size in Advanced Settings")?;
            }
            AppError::Cancelled => {
                state.serialize_field("code", "CANCELLED")?;
                state.serialize_field("message", "Upscaling cancelled")?;
                state.serialize_field("suggestion", "Job stopped by user")?;
            }
        }
        state.end()
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
}

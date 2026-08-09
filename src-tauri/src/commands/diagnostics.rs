use crate::sidecar_manager;
use crate::video_pipeline;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SystemDiagnostics {
    pub sidecar_realesrgan: String,
    pub sidecar_ffmpeg: String,
    pub sidecar_ffprobe: String,
    pub gpus_detected: usize,
    pub available_encoders: Vec<String>,
    pub is_win64: bool,
}

#[tauri::command]
pub async fn get_system_diagnostics(
    app_handle: tauri::AppHandle,
) -> Result<SystemDiagnostics, String> {
    let sidecar_realesrgan =
        sidecar_manager::resolve_sidecar_path(&app_handle, "realesrgan-ncnn-vulkan")
            .map(|p| {
                p.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|_| "Missing".to_string());

    let sidecar_ffmpeg = video_pipeline::resolve_ffmpeg_binary(&app_handle)
        .map(|p| {
            std::path::Path::new(&p)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_else(|_| "Missing".to_string());

    let sidecar_ffprobe = video_pipeline::resolve_ffprobe_binary(&app_handle)
        .map(|p| {
            std::path::Path::new(&p)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_else(|_| "Missing".to_string());

    let gpus = sidecar_manager::get_gpu_list(&app_handle).unwrap_or_default();

    let mut available_encoders = Vec::new();
    let ffmpeg_bin =
        video_pipeline::resolve_ffmpeg_binary(&app_handle).unwrap_or_else(|_| "ffmpeg".to_string());

    for &enc in &["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf"] {
        let res = std::process::Command::new(&ffmpeg_bin)
            .args(&["-h", &format!("encoder={}", enc)])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        if let Ok(st) = res {
            if st.success() {
                available_encoders.push(enc.to_string());
            }
        }
    }

    Ok(SystemDiagnostics {
        sidecar_realesrgan,
        sidecar_ffmpeg,
        sidecar_ffprobe,
        gpus_detected: gpus.len(),
        available_encoders,
        is_win64: cfg!(all(target_os = "windows", target_arch = "x86_64")),
    })
}

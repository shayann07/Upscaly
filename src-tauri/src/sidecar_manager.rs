use tauri::{AppHandle, Manager, path::BaseDirectory};
use std::path::PathBuf;
use std::process::{Command, Stdio, Child};
use std::sync::{Mutex, OnceLock};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuDevice {
    pub id: i32,
    pub name: String,
}

static ACTIVE_PROCESSES: OnceLock<Mutex<Vec<Child>>> = OnceLock::new();

fn get_active_processes() -> &'static Mutex<Vec<Child>> {
    ACTIVE_PROCESSES.get_or_init(|| Mutex::new(Vec::new()))
}

/// Resolves the path to a sidecar binary, supporting dev, resources, and exe-relative directory layouts.
pub fn resolve_sidecar_path(app: &AppHandle, binary_name: &str) -> Result<PathBuf, String> {
    let target_triple = if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let filename = if cfg!(target_os = "windows") {
        format!("{}-{}.exe", binary_name, target_triple)
    } else {
        format!("{}-{}", binary_name, target_triple)
    };

    // 1. Try resolving via tauri Resource directory
    if let Ok(path) = app.path().resolve(format!("binaries/{}", filename), BaseDirectory::Resource) {
        if path.exists() {
            return Ok(path);
        }
    }

    if let Ok(path) = app.path().resolve(&filename, BaseDirectory::Resource) {
        if path.exists() {
            return Ok(path);
        }
    }

    // 2. Try exe path relative
    if let Ok(mut exe_path) = std::env::current_exe() {
        exe_path.pop(); // remove executable name
        
        let path = exe_path.join("binaries").join(&filename);
        if path.exists() {
            return Ok(path);
        }

        let path_direct = exe_path.join(&filename);
        if path_direct.exists() {
            return Ok(path_direct);
        }

        // Check if inside target/debug or similar for development
        let parent = exe_path.parent();
        if let Some(p) = parent {
            let dev_path = p.join("binaries").join(&filename);
            if dev_path.exists() {
                return Ok(dev_path);
            }
        }
    }

    // Fallback: check current directory and src-tauri/binaries
    let local_path = PathBuf::from("src-tauri").join("binaries").join(&filename);
    if local_path.exists() {
        return Ok(local_path);
    }

    let local_path2 = PathBuf::from("binaries").join(&filename);
    if local_path2.exists() {
        return Ok(local_path2);
    }

    Err(format!("Could not find sidecar binary '{}'", filename))
}

#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    CreateJobObjectW, SetInformationJobObject, AssignProcessToJobObject,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JobObjectExtendedLimitInformation,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HANDLE;
#[cfg(target_os = "windows")]
use std::os::windows::io::AsRawHandle;

/// Attaches a spawned child process to a Windows Job Object configured to kill child processes on parent exit.
#[cfg(target_os = "windows")]
pub fn attach_to_job_object(child: &Child) {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job != 0 {
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn attach_to_job_object(_child: &Child) {}

/// Discovers Vulkan GPU devices with 5-second timeout and disk caching.
pub fn get_gpu_list(app: &AppHandle) -> Result<Vec<GpuDevice>, String> {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let cache_path = app_dir.join("gpu_cache.json");

    // 1. Try reading disk cache
    if cache_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cache_path) {
            if let Ok(cached_gpus) = serde_json::from_str::<Vec<GpuDevice>>(&content) {
                if !cached_gpus.is_empty() {
                    return Ok(cached_gpus);
                }
            }
        }
    }

    // 2. Perform raw discovery
    let gpus = probe_gpus_raw(app)?;

    // 3. Write cache to disk
    let _ = std::fs::create_dir_all(&app_dir);
    if let Ok(json) = serde_json::to_string_pretty(&gpus) {
        let _ = std::fs::write(&cache_path, json);
    }

    Ok(gpus)
}

fn probe_gpus_raw(app: &AppHandle) -> Result<Vec<GpuDevice>, String> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = crate::model_manager::get_models_dir(app);

    let output = Command::new(sidecar_path)
        .args(&[
            "-i", "non-existent-image-path.jpg",
            "-o", "dummy.png",
            "-m", models_dir.to_str().unwrap_or("models"),
            "-v"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let mut gpus = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    if let Ok(output_data) = output {
        let stderr_str = String::from_utf8_lossy(&output_data.stderr);
        let stdout_str = String::from_utf8_lossy(&output_data.stdout);

        for line in stderr_str.lines().chain(stdout_str.lines()) {
            if line.starts_with('[') && line.contains("] ") {
                if let Some(end_idx) = line.find(']') {
                    let inner = &line[1..end_idx];
                    let parts: Vec<&str> = inner.splitn(2, ' ').collect();
                    if parts.len() == 2 {
                        if let Ok(id) = parts[0].parse::<i32>() {
                            if !seen_ids.contains(&id) {
                                seen_ids.insert(id);
                                gpus.push(GpuDevice {
                                    id,
                                    name: parts[1].to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    if gpus.is_empty() {
        gpus.push(GpuDevice {
            id: 0,
            name: "Auto / Default Vulkan GPU".to_string(),
        });
    }

    gpus.sort_by_key(|g| g.id);
    Ok(gpus)
}

/// Track a newly spawned child process
#[allow(dead_code)]
pub fn register_process(child: Child) {
    attach_to_job_object(&child);
    if let Ok(mut lock) = get_active_processes().lock() {
        lock.push(child);
    }
}

/// Kill all active sidecar processes (e.g. on exit or job cancellation)
pub fn kill_all_processes() {
    if let Ok(mut lock) = get_active_processes().lock() {
        for mut child in lock.drain(..) {
            let _ = child.kill();
        }
    }
}

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{path::BaseDirectory, AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuDevice {
    pub id: i32,
    pub name: String,
    pub detail: String,
    pub vram_mb: u64,
    pub fp16_storage_supported: bool,
    pub fp16_arithmetic_supported: bool,
    pub compute_queue_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GpuCacheEnvelope {
    pub timestamp: u64,
    pub sidecar_hash: String,
    pub devices: Vec<GpuDevice>,
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
    if let Ok(path) = app
        .path()
        .resolve(format!("binaries/{}", filename), BaseDirectory::Resource)
    {
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

    // Additional plain binary fallback without target triple
    let plain_name = if cfg!(target_os = "windows") {
        format!("{binary_name}.exe")
    } else {
        binary_name.to_string()
    };

    let plain_local = PathBuf::from("src-tauri")
        .join("binaries")
        .join(&plain_name);
    if plain_local.exists() {
        return Ok(plain_local);
    }

    let plain_local2 = PathBuf::from("binaries").join(&plain_name);
    if plain_local2.exists() {
        return Ok(plain_local2);
    }

    Err(format!("Could not find sidecar binary '{filename}'"))
}

#[cfg(target_os = "windows")]
use std::os::windows::io::AsRawHandle;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HANDLE;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

#[cfg(target_os = "windows")]
static GLOBAL_JOB_OBJECT: OnceLock<usize> = OnceLock::new();

#[cfg(target_os = "windows")]
#[allow(
    unsafe_code,
    clippy::ptr_as_ptr,
    clippy::borrow_as_ptr,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap
)]
fn get_or_create_job_object() -> usize {
    *GLOBAL_JOB_OBJECT.get_or_init(|| unsafe {
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
        }
        job as usize
    })
}

/// Attaches a spawned child process to a Windows Job Object configured to kill child processes on parent exit.
#[cfg(target_os = "windows")]
#[allow(unsafe_code)]
pub fn attach_to_job_object(child: &Child) {
    let job_handle = get_or_create_job_object();
    if job_handle != 0 {
        unsafe {
            AssignProcessToJobObject(job_handle as HANDLE, child.as_raw_handle() as HANDLE);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn attach_to_job_object(_child: &Child) {}

/// Discovers Vulkan GPU devices with 24-hour cache lifecycle.
pub fn get_gpu_list(app: &AppHandle) -> Result<Vec<GpuDevice>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let cache_path = app_dir.join("gpu_cache.json");

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan").ok();
    let current_hash = sidecar_path
        .as_ref()
        .and_then(|p| crate::model_manager::calculate_sha256(p).ok())
        .unwrap_or_default();

    // 1. Try reading disk cache if under 24 hours old (86,400s) and non-empty
    if cache_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cache_path) {
            if let Ok(cache) = serde_json::from_str::<GpuCacheEnvelope>(&content) {
                let age = now_secs.saturating_sub(cache.timestamp);
                let hash_matches =
                    cache.sidecar_hash.is_empty() || cache.sidecar_hash == current_hash;

                if age < 86400 && hash_matches && !cache.devices.is_empty() {
                    return Ok(cache.devices);
                }
            }
        }
    }

    // 2. Perform raw discovery
    let gpus = probe_gpus_raw(app)?;

    // 3. Write cache envelope to disk if GPUs were successfully discovered
    if !gpus.is_empty() {
        let _ = std::fs::create_dir_all(&app_dir);
        let envelope = GpuCacheEnvelope {
            timestamp: now_secs,
            sidecar_hash: current_hash,
            devices: gpus.clone(),
        };

        if let Ok(json) = serde_json::to_string_pretty(&envelope) {
            let _ = std::fs::write(&cache_path, json);
        }
    }

    Ok(gpus)
}

fn probe_gpus_raw(app: &AppHandle) -> Result<Vec<GpuDevice>, String> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = crate::model_manager::get_models_dir(app);

    let mut child = Command::new(sidecar_path)
        .args([
            "-i",
            "non-existent-image-path.jpg",
            "-o",
            "dummy.png",
            "-m",
            models_dir.to_str().unwrap_or("models"),
            "-v",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn GPU probe process: {e}"))?;

    attach_to_job_object(&child);

    // Timeout mechanism (5 seconds max for GPU discovery)
    let start_time = std::time::Instant::now();
    let output_data = loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                break child.wait_with_output().ok();
            }
            Ok(None) => {
                if start_time.elapsed() > std::time::Duration::from_secs(5) {
                    let _ = child.kill();
                    break None;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => {
                let _ = child.kill();
                break None;
            }
        }
    };

    let mut gpus = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    if let Some(output_data) = output_data {
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
                                let name = parts[1].trim().to_string();
                                let lower = name.to_lowercase();
                                let is_discrete = (lower.contains("nvidia")
                                    || lower.contains("geforce")
                                    || lower.contains("rtx")
                                    || lower.contains("gtx")
                                    || lower.contains("quadro")
                                    || lower.contains("radeon")
                                    || (lower.contains("amd")
                                        && !lower.contains("radeon(tm) graphics")))
                                    && !lower.contains("intel")
                                    && !lower.contains("uhd")
                                    && !lower.contains("iris");

                                let vram_mb = query_dxgi_vram_mb(&name, is_discrete);

                                let detail = if is_discrete {
                                    format!("High-Performance Discrete GPU · {:.1} GB VRAM · Vulkan 1.2", vram_mb as f64 / 1024.0)
                                } else if lower.contains("intel") {
                                    format!(
                                        "Integrated Graphics · {:.1} GB Shared · Vulkan 1.2",
                                        vram_mb as f64 / 1024.0
                                    )
                                } else if !lower.contains("cpu") {
                                    format!("Vulkan 1.2 · {:.1} GB VRAM", vram_mb as f64 / 1024.0)
                                } else {
                                    "Vulkan Compute Device".to_string()
                                };

                                gpus.push(GpuDevice {
                                    id,
                                    name: name.clone(),
                                    detail,
                                    vram_mb,
                                    fp16_storage_supported: is_discrete || !lower.contains("cpu"),
                                    fp16_arithmetic_supported: is_discrete
                                        || !lower.contains("cpu"),
                                    compute_queue_count: if is_discrete { 16 } else { 2 },
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Prioritize discrete GPUs (NVIDIA, AMD Radeon) first, then integrated GPUs, then CPU
    gpus.sort_by(|a, b| {
        let is_a_discrete = a.detail.contains("Discrete");
        let is_b_discrete = b.detail.contains("Discrete");
        match (is_a_discrete, is_b_discrete) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.id.cmp(&b.id),
        }
    });

    Ok(gpus)
}

#[cfg(target_os = "windows")]
#[allow(unsafe_code)]
pub fn query_dxgi_vram_mb(name: &str, is_discrete: bool) -> u64 {
    use std::ffi::c_void;

    #[repr(C)]
    struct GUID {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    #[repr(C)]
    struct DXGI_ADAPTER_DESC1 {
        description: [u16; 128],
        vendor_id: u32,
        device_id: u32,
        sub_sys_id: u32,
        revision: u32,
        dedicated_video_memory: usize,
        dedicated_system_memory: usize,
        shared_system_memory: usize,
        adapter_luid_low: u32,
        adapter_luid_high: i32,
        flags: u32,
    }

    #[repr(C)]
    struct IDXGIAdapter1Vtbl {
        query_interface: *const c_void,
        add_ref: *const c_void,
        release: unsafe extern "system" fn(this: *mut c_void) -> u32,
        set_private_data: *const c_void,
        set_private_data_interface: *const c_void,
        get_private_data: *const c_void,
        get_parent: *const c_void,
        get_desc: *const c_void,
        get_desc1:
            unsafe extern "system" fn(this: *mut c_void, desc: *mut DXGI_ADAPTER_DESC1) -> i32,
    }

    #[repr(C)]
    struct IDXGIAdapter1 {
        lp_vtbl: *const IDXGIAdapter1Vtbl,
    }

    #[repr(C)]
    struct IDXGIFactory1Vtbl {
        query_interface: *const c_void,
        add_ref: *const c_void,
        release: unsafe extern "system" fn(this: *mut c_void) -> u32,
        set_private_data: *const c_void,
        set_private_data_interface: *const c_void,
        get_private_data: *const c_void,
        get_parent: *const c_void,
        enum_adapters: *const c_void,
        make_window_association: *const c_void,
        get_window_association: *const c_void,
        create_swap_chain: *const c_void,
        create_software_adapter: *const c_void,
        enum_adapters1: unsafe extern "system" fn(
            this: *mut c_void,
            adapter_index: u32,
            pp_adapter: *mut *mut IDXGIAdapter1,
        ) -> i32,
    }

    #[repr(C)]
    struct IDXGIFactory1 {
        lp_vtbl: *const IDXGIFactory1Vtbl,
    }

    type CreateDXGIFactory1Fn =
        unsafe extern "system" fn(riid: *const GUID, pp_factory: *mut *mut IDXGIFactory1) -> i32;

    let target_name_lower = name.to_lowercase();

    unsafe {
        use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
        let module = LoadLibraryA(b"dxgi.dll\0".as_ptr());
        if module == 0 {
            return extract_gpu_vram_mb(name, is_discrete);
        }

        let func = GetProcAddress(module, b"CreateDXGIFactory1\0".as_ptr());
        if func.is_none() {
            return extract_gpu_vram_mb(name, is_discrete);
        }

        let create_dxgi_factory1: CreateDXGIFactory1Fn = std::mem::transmute(func);

        let iid = GUID {
            data1: 0x770aae78,
            data2: 0xf26f,
            data3: 0x4dba,
            data4: [0xa8, 0x29, 0x25, 0x3c, 0x83, 0xd1, 0xb3, 0x87],
        };

        let mut factory: *mut IDXGIFactory1 = std::ptr::null_mut();
        if create_dxgi_factory1(&iid, &mut factory) >= 0 && !factory.is_null() {
            let mut i = 0u32;
            let mut matched_vram = 0u64;

            loop {
                let mut adapter: *mut IDXGIAdapter1 = std::ptr::null_mut();
                if ((*(*factory).lp_vtbl).enum_adapters1)(factory as *mut _, i, &mut adapter) < 0
                    || adapter.is_null()
                {
                    break;
                }

                let mut desc: DXGI_ADAPTER_DESC1 = std::mem::zeroed();
                if ((*(*adapter).lp_vtbl).get_desc1)(adapter as *mut _, &mut desc) >= 0 {
                    let len = desc
                        .description
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(desc.description.len());
                    let desc_str =
                        String::from_utf16_lossy(&desc.description[..len]).to_lowercase();
                    let vram_mb = (desc.dedicated_video_memory as u64) / (1024 * 1024);

                    if (desc_str.contains("nvidia") && target_name_lower.contains("nvidia"))
                        || (desc_str.contains("intel") && target_name_lower.contains("intel"))
                        || (desc_str.contains("amd") && target_name_lower.contains("amd"))
                        || target_name_lower.contains(&desc_str)
                        || desc_str.contains(&target_name_lower)
                    {
                        if vram_mb > 0 {
                            matched_vram = vram_mb;
                            let _ = ((*(*adapter).lp_vtbl).release)(adapter as *mut _);
                            break;
                        }
                    }
                }

                let _ = ((*(*adapter).lp_vtbl).release)(adapter as *mut _);
                i += 1;
            }

            let _ = ((*(*factory).lp_vtbl).release)(factory as *mut _);

            if matched_vram > 0 {
                return matched_vram;
            }
        }
    }

    extract_gpu_vram_mb(name, is_discrete)
}

#[cfg(not(target_os = "windows"))]
pub fn query_dxgi_vram_mb(name: &str, is_discrete: bool) -> u64 {
    extract_gpu_vram_mb(name, is_discrete)
}

pub fn extract_gpu_vram_mb(name: &str, is_discrete: bool) -> u64 {
    let lower = name.to_lowercase();
    for part in lower.split_whitespace() {
        if let Some(gb_str) = part.strip_suffix("gb") {
            if let Ok(gb) = gb_str.parse::<u64>() {
                if (1..=64).contains(&gb) {
                    return gb * 1024;
                }
            }
        }
    }

    if lower.contains("4090") || lower.contains("3090") {
        24576
    } else if lower.contains("4080") || lower.contains("7900") {
        16384
    } else if lower.contains("4070") || lower.contains("3080") || lower.contains("6800") {
        12288
    } else if lower.contains("4060")
        || lower.contains("3070")
        || lower.contains("3060")
        || lower.contains("6700")
    {
        8192
    } else if lower.contains("3050")
        || lower.contains("2060")
        || lower.contains("1660")
        || lower.contains("1060")
        || lower.contains("5600")
    {
        6144
    } else if lower.contains("1650")
        || lower.contains("1050")
        || lower.contains("5500")
        || lower.contains("580")
    {
        4096
    } else if is_discrete {
        6144
    } else if lower.contains("intel")
        || lower.contains("uhd")
        || lower.contains("iris")
        || lower.contains("vega")
    {
        2048
    } else {
        1024
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_device_struct() {
        let gpu = GpuDevice {
            id: 0,
            name: "NVIDIA GeForce RTX 3050 Laptop GPU 6GB".to_string(),
            detail: "Vulkan 1.2 · FP16 Storage/Arith Supported".to_string(),
            vram_mb: 6144,
            fp16_storage_supported: true,
            fp16_arithmetic_supported: true,
            compute_queue_count: 8,
        };

        assert_eq!(gpu.id, 0);
        assert_eq!(gpu.name, "NVIDIA GeForce RTX 3050 Laptop GPU 6GB");
        assert!(gpu.fp16_storage_supported);

        let json = serde_json::to_string(&gpu).unwrap();
        assert!(json.contains("RTX 3050"));
        assert!(json.contains("fp16_storage_supported"));
    }
}

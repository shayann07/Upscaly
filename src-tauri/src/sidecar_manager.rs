use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
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

/// A child process polled by whoever spawned it rather than owned by the
/// job queue -- the GPU probe and the ffprobe metadata read. Shared so app
/// shutdown can reap one that is still running, while its spawner keeps
/// polling the same handle. `None` means it has already been reaped.
pub type TrackedChild = Arc<Mutex<Option<Child>>>;

static ACTIVE_PROCESSES: OnceLock<Mutex<Vec<TrackedChild>>> = OnceLock::new();

fn get_active_processes() -> &'static Mutex<Vec<TrackedChild>> {
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
        format!("{binary_name}-{target_triple}.exe")
    } else {
        format!("{binary_name}-{target_triple}")
    };

    // 1. Try resolving via tauri Resource directory
    if let Ok(path) = app
        .path()
        .resolve(format!("binaries/{filename}"), BaseDirectory::Resource)
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
    let handle = GLOBAL_JOB_OBJECT.get_or_init(|| unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job != 0 {
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let info_ptr = std::ptr::from_ref(&info).cast();
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                info_ptr,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
        }
        job as usize
    });
    *handle
}

/// Attaches a spawned child process to a Windows Job Object configured to kill child processes on parent exit.
#[cfg(target_os = "windows")]
#[allow(unsafe_code)]
pub fn attach_to_job_object(child: &Child) {
    let job_handle = get_or_create_job_object();
    if job_handle != 0 {
        unsafe {
            AssignProcessToJobObject(job_handle.cast_signed(), child.as_raw_handle() as HANDLE);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn attach_to_job_object(_child: &Child) {}

static IN_MEMORY_GPU_CACHE: std::sync::Mutex<Option<Vec<GpuDevice>>> = std::sync::Mutex::new(None);
// A probe that legitimately found no GPUs (iGPU-less/Vulkan-less machine)
// was never cached at all, so every call -- including the two per video
// job that need a fresh tile/thread profile -- re-ran the full up-to-5s
// probe. This is a much shorter TTL than the 24h positive cache so a
// driver install without restarting the app is still picked up promptly.
static EMPTY_PROBE_AT: std::sync::Mutex<Option<u64>> = std::sync::Mutex::new(None);
const EMPTY_PROBE_TTL_SECS: u64 = 60;

/// Discovers Vulkan GPU devices with 24-hour cache lifecycle and instant in-memory lookup.
pub fn get_gpu_list(app: &AppHandle) -> Result<Vec<GpuDevice>, String> {
    if let Ok(guard) = IN_MEMORY_GPU_CACHE.lock() {
        if let Some(ref cached) = *guard {
            if !cached.is_empty() {
                return Ok(cached.clone());
            }
        }
    }

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Ok(guard) = EMPTY_PROBE_AT.lock() {
        if let Some(ts) = *guard {
            if now_secs.saturating_sub(ts) < EMPTY_PROBE_TTL_SECS {
                return Ok(Vec::new());
            }
        }
    }

    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let cache_path = app_dir.join("gpu_cache.json");

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
                    if let Ok(mut guard) = IN_MEMORY_GPU_CACHE.lock() {
                        *guard = Some(cache.devices.clone());
                    }
                    return Ok(cache.devices);
                }
            }
        }
    }

    // 2. Perform raw discovery
    let gpus = probe_gpus_raw(app)?;

    // 3. Write cache envelope to disk and memory if GPUs were successfully discovered
    if !gpus.is_empty() {
        if let Ok(mut guard) = IN_MEMORY_GPU_CACHE.lock() {
            *guard = Some(gpus.clone());
        }

        let _ = std::fs::create_dir_all(&app_dir);
        let envelope = GpuCacheEnvelope {
            timestamp: now_secs,
            sidecar_hash: current_hash,
            devices: gpus.clone(),
        };

        if let Ok(json) = serde_json::to_string_pretty(&envelope) {
            let _ = std::fs::write(&cache_path, json);
        }
    } else if let Ok(mut guard) = EMPTY_PROBE_AT.lock() {
        *guard = Some(now_secs);
    }

    Ok(gpus)
}

#[allow(clippy::similar_names)]
fn cmp_by_discrete(a: &GpuDevice, b: &GpuDevice) -> std::cmp::Ordering {
    let is_a_discrete = a.detail.contains("Discrete");
    let is_b_discrete = b.detail.contains("Discrete");
    match (is_a_discrete, is_b_discrete) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.id.cmp(&b.id),
    }
}

// Long by line count only because of the deliberate background-thread pipe
// draining (see comment below) needed to avoid the GPU-probe deadlock this
// function was rewritten to fix -- splitting it up would scatter that
// invariant across functions rather than simplify anything.
#[allow(clippy::too_many_lines, clippy::cast_precision_loss)]
fn probe_gpus_raw(app: &AppHandle) -> Result<Vec<GpuDevice>, String> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = crate::model_manager::get_models_dir(app);

    let mut cmd = Command::new(sidecar_path);
    cmd.args([
        "-i",
        "non-existent-image-path.jpg",
        "-o",
        "dummy.png",
        "-m",
        models_dir.to_str().unwrap_or("models"),
        "-v",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    crate::process_runner::suppress_console_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn GPU probe process: {e}"))?;

    // Drain stdout/stderr on background threads instead of only polling
    // try_wait() below. A GPU probe verbose enough to exceed the OS pipe
    // buffer (common with -v on multi-GPU systems) would otherwise block
    // the child on a full pipe forever; try_wait() kept returning
    // Ok(None), so the 5s timeout always won, the child got killed, and
    // wait_with_output() was never reached -- discarding all output and
    // yielding an empty GPU list every time this ran.
    let stdout_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

    let stdout_handle = child.stdout.take().map(|mut stdout| {
        let buf = Arc::clone(&stdout_buf);
        std::thread::spawn(move || {
            use std::io::Read;
            let mut s = String::new();
            let _ = stdout.read_to_string(&mut s);
            if let Ok(mut guard) = buf.lock() {
                *guard = s;
            }
        })
    });
    let stderr_handle = child.stderr.take().map(|mut stderr| {
        let buf = Arc::clone(&stderr_buf);
        std::thread::spawn(move || {
            use std::io::Read;
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s);
            if let Ok(mut guard) = buf.lock() {
                *guard = s;
            }
        })
    });

    // Tracked from here on so an app exit mid-probe reaps it rather than
    // orphaning it (attach_to_job_object happens inside register_process).
    let tracked = register_process(child);

    // Timeout mechanism (5 seconds max for GPU discovery)
    let start_time = std::time::Instant::now();
    let exited = loop {
        let poll = {
            let mut slot = tracked
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            match slot.as_mut() {
                // kill_all_processes took it: the app is shutting down.
                None => break false,
                Some(child) => child.try_wait(),
            }
        };

        match poll {
            Ok(Some(_status)) => break true,
            Ok(None) => {
                if start_time.elapsed() > std::time::Duration::from_secs(5) {
                    let mut slot = tracked
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    if let Some(child) = slot.as_mut() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    break false;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => {
                let mut slot = tracked
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if let Some(child) = slot.as_mut() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                break false;
            }
        }
    };

    release_process(&tracked);

    // The child process (and therefore its pipe write ends) has exited or
    // been killed by this point, so these reads are guaranteed to hit EOF
    // and return rather than block.
    if let Some(h) = stdout_handle {
        let _ = h.join();
    }
    if let Some(h) = stderr_handle {
        let _ = h.join();
    }

    let mut gpus = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    if exited {
        let stderr_str = stderr_buf.lock().map(|g| g.clone()).unwrap_or_default();
        let stdout_str = stdout_buf.lock().map(|g| g.clone()).unwrap_or_default();

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
    gpus.sort_by(cmp_by_discrete);

    Ok(gpus)
}

/// How well a DXGI adapter description matches the GPU we asked about.
/// Higher is a better match; `ADAPTER_MATCH_NONE` means it isn't one.
#[cfg(target_os = "windows")]
mod adapter_match {
    pub const NONE: u8 = 0;
    /// No specific adapter was requested, so every adapter qualifies
    /// equally and the caller's VRAM tie-break decides.
    pub const ANY: u8 = 1;
    /// Same vendor, different card. The weakest real signal: on a machine
    /// with two cards from one vendor this matches both.
    pub const VENDOR: u8 = 2;
    /// One name contains the other.
    pub const CONTAINS: u8 = 3;
    pub const EXACT: u8 = 4;
}

/// Vendor keyword groups. A GPU's marketing name often omits the vendor
/// (e.g. "Radeon RX 6800 XT" never says "AMD"), so matching on the vendor
/// word alone misses adapters it should match.
#[cfg(target_os = "windows")]
const VENDOR_ALIASES: [&[&str]; 3] = [
    &["nvidia", "geforce", "rtx", "gtx", "quadro"],
    &["amd", "radeon"],
    &["intel", "arc", "iris", "uhd"],
];

#[cfg(target_os = "windows")]
fn is_same_vendor(a: &str, b: &str) -> bool {
    VENDOR_ALIASES.iter().any(|aliases| {
        aliases.iter().any(|kw| a.contains(kw)) && aliases.iter().any(|kw| b.contains(kw))
    })
}

/// Scores one adapter description against the requested GPU name.
///
/// Previously the DXGI walk returned the first adapter whose vendor word
/// appeared in both strings. On a dual-AMD machine (integrated Radeon plus
/// a discrete Radeon) *both* adapters match that test, so the walk always
/// reported adapter 0's VRAM no matter which card was asked about --
/// sizing tiles against the wrong GPU's memory. Scoring every adapter and
/// keeping the best match fixes that, and lets an exact name beat a
/// coincidental vendor hit.
#[cfg(target_os = "windows")]
fn score_adapter_match(desc_lower: &str, target_lower: &str) -> u8 {
    if target_lower.is_empty() {
        return adapter_match::ANY;
    }
    if desc_lower == target_lower {
        return adapter_match::EXACT;
    }
    if desc_lower.contains(target_lower) || target_lower.contains(desc_lower) {
        return adapter_match::CONTAINS;
    }
    if is_same_vendor(desc_lower, target_lower) {
        return adapter_match::VENDOR;
    }
    adapter_match::NONE
}

// Raw COM/DXGI vtable interop: the pointer casts, borrow-as-pointer
// patterns, and the `GUID` type name all mirror the actual Win32/DXGI ABI,
// so "fixing" them (e.g. .cast() instead of `as`, renaming GUID) would just
// be stylistic churn on unsafe FFI code that already carries its own risk.
#[cfg(target_os = "windows")]
#[allow(
    unsafe_code,
    clippy::ptr_as_ptr,
    clippy::borrow_as_ptr,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    clippy::cast_precision_loss,
    clippy::upper_case_acronyms,
    clippy::too_many_lines,
    clippy::unreadable_literal,
    clippy::manual_c_str_literals,
    clippy::collapsible_if
)]
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
            let mut best_score = adapter_match::NONE;

            // Enumerate every adapter and keep the best match rather than
            // stopping at the first plausible one -- see score_adapter_match
            // for why first-match silently picked the wrong card.
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
                    let score = score_adapter_match(&desc_str, &target_name_lower);

                    // Tie-break equally-good matches by VRAM, which picks the
                    // discrete card over an integrated one when the request
                    // can't distinguish them (notably the empty-name path
                    // used for the general VRAM estimate).
                    if score > adapter_match::NONE
                        && vram_mb > 0
                        && (score > best_score || (score == best_score && vram_mb > matched_vram))
                    {
                        best_score = score;
                        matched_vram = vram_mb;
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

/// Attaches a freshly spawned child to the shutdown registry and returns the
/// handle its spawner should poll through.
///
/// On Windows the job object alone guarantees these die with the parent, so
/// this registry is belt-and-braces there. On every other platform
/// `attach_to_job_object` is a no-op and this is the *only* mechanism that
/// reaps a probe still running when the app quits -- previously nothing
/// registered at all, so `kill_all_processes` drained an empty list and
/// those children were simply orphaned.
pub fn register_process(child: Child) -> TrackedChild {
    attach_to_job_object(&child);
    let tracked: TrackedChild = Arc::new(Mutex::new(Some(child)));
    if let Ok(mut lock) = get_active_processes().lock() {
        lock.push(Arc::clone(&tracked));
    }
    tracked
}

/// Stops tracking a child whose spawner has finished with it.
pub fn release_process(tracked: &TrackedChild) {
    // Clear the slot first and drop the guard before touching the registry:
    // kill_all_processes locks registry-then-child, so holding a child lock
    // while taking the registry lock would invert that order.
    if let Ok(mut slot) = tracked.lock() {
        *slot = None;
    }
    if let Ok(mut lock) = get_active_processes().lock() {
        lock.retain(|entry| entry.lock().is_ok_and(|slot| slot.is_some()));
    }
}

/// Kill all tracked sidecar processes (e.g. on exit or job cancellation)
pub fn kill_all_processes() {
    if let Ok(mut lock) = get_active_processes().lock() {
        for tracked in lock.drain(..) {
            if let Ok(mut slot) = tracked.lock() {
                if let Some(mut child) = slot.take() {
                    let _ = child.kill();
                    // Reap the zombie so the exit status is collected rather
                    // than left for init on Unix.
                    let _ = child.wait();
                }
            }
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

    #[cfg(target_os = "windows")]
    #[test]
    fn test_score_adapter_match_ranks_exact_above_vendor() {
        let target = "amd radeon rx 6800 xt";

        assert_eq!(
            score_adapter_match("amd radeon rx 6800 xt", target),
            adapter_match::EXACT
        );
        assert_eq!(
            score_adapter_match("amd radeon rx 6800 xt (0x1234)", target),
            adapter_match::CONTAINS
        );
        // A different AMD card is only a vendor-level match.
        assert_eq!(
            score_adapter_match("amd radeon(tm) graphics", target),
            adapter_match::VENDOR
        );
        assert_eq!(
            score_adapter_match("nvidia geforce rtx 3050", target),
            adapter_match::NONE
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_score_adapter_match_recognizes_vendor_without_the_vendor_word() {
        // "Radeon RX 6800" never says "AMD"; "GeForce RTX 3050" never says
        // "NVIDIA". Matching on the bare vendor word alone missed both.
        assert_eq!(
            score_adapter_match("radeon rx 6800", "amd radeon rx 7900"),
            adapter_match::VENDOR
        );
        assert_eq!(
            score_adapter_match("geforce rtx 3050", "nvidia geforce gtx 1660"),
            adapter_match::VENDOR
        );
        assert_eq!(
            score_adapter_match("radeon rx 6800", "nvidia geforce rtx 3050"),
            adapter_match::NONE
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_score_adapter_match_treats_empty_target_as_wildcard() {
        // The VRAM-estimate path passes an empty name: every adapter is an
        // equal match so the caller's VRAM tie-break selects the biggest.
        assert_eq!(
            score_adapter_match("intel uhd graphics", ""),
            adapter_match::ANY
        );
        assert_eq!(
            score_adapter_match("nvidia geforce rtx 4090", ""),
            adapter_match::ANY
        );
    }

    #[test]
    fn test_register_process_tracks_and_release_untracks() {
        // register_process previously had no callers at all, so the registry
        // kill_all_processes drains was permanently empty and the whole
        // shutdown path was a no-op on any platform without job objects.
        let before = get_active_processes()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .len();

        let mut cmd = Command::new(if cfg!(windows) { "cmd" } else { "sh" });
        cmd.args(if cfg!(windows) {
            ["/C", "exit 0"]
        } else {
            ["-c", "exit 0"]
        })
        .stdout(Stdio::null())
        .stderr(Stdio::null());
        crate::process_runner::suppress_console_window(&mut cmd);

        let Ok(child) = cmd.spawn() else {
            // No shell available in this environment; nothing to assert.
            return;
        };

        let tracked = register_process(child);
        let during = get_active_processes()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .len();
        assert_eq!(during, before + 1, "registered child should be tracked");

        if let Ok(mut slot) = tracked.lock() {
            if let Some(child) = slot.as_mut() {
                let _ = child.wait();
            }
        }

        release_process(&tracked);
        let after = get_active_processes()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .len();
        assert_eq!(after, before, "released child should be untracked");
        assert!(
            tracked
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .is_none(),
            "released slot should be emptied"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_dual_same_vendor_adapters_are_distinguishable() {
        // The regression this scoring exists for: two AMD adapters where the
        // requested one is NOT enumerated first. Vendor-only matching scored
        // both identically, so first-match returned the integrated card.
        let integrated = "amd radeon(tm) graphics";
        let discrete = "amd radeon rx 6800 xt";
        let target = "amd radeon rx 6800 xt";

        assert!(
            score_adapter_match(discrete, target) > score_adapter_match(integrated, target),
            "the requested discrete card must outrank a same-vendor integrated one"
        );
    }
}

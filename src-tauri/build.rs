fn main() {
    println!("cargo:rustc-check-cfg=cfg(mobile)");
    // The mobile app is a separate crate (Android port plan, Phase 2) with its
    // own tauri.conf.json, capabilities and build.rs. Running tauri_build here
    // for an Android target would generate THIS (desktop) app's context, which
    // fails for two reasons that are both properties of the desktop config,
    // not of the shared library code:
    //
    //   1. externalBin resolves `binaries/realesrgan-ncnn-vulkan-<triple>`,
    //      and no Android sidecar exists -- nor should one, since the mobile
    //      build links NCNN in-process instead of shelling out.
    //   2. capabilities/default.json names dialog/updater/process permissions
    //      whose plugins leave the dependency graph under `--features mobile`.
    //
    // The Android target is therefore a COMPILE LINT over the shared Rust
    // (engine, governor, job queue/store, model manager, types) -- which is
    // what catches a windows-sys-class regression. A real Tauri Android build
    // is proven by the mobile repo's own APK gate.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        tauri_build::build();
    }
}

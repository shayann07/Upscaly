# Codebase Audit And Fixture Plan

Generated: 2026-08-09

Scope: full repository inventory excluding dependency/build internals (`node_modules`, `.git`, `dist`). Source, Tauri backend, frontend components, tests, scripts, docs, model/binary assets, and copied design handoff files were reviewed. Binary/model/image assets were audited by role, path, and packaging risk rather than byte-level contents.

## Web Research Used

- Tauri v2 security guidance says app security is the sum of Tauri, Rust/npm dependencies, app code, and the user device; IPC access is controlled through capabilities and command implementations. Source: https://v2.tauri.app/security/
- Tauri scopes are granular allow/deny controls, and custom command developers must enforce scopes in command implementation. Source: https://v2.tauri.app/security/scope/
- Tauri capabilities should define which windows/webviews receive which permissions; broad capabilities merge into the runtime security boundary. Source: https://tauri.app/learn/security/capabilities-for-windows-and-platforms/
- Tauri process-model guidance favors isolating long-running work from the WebView so UI remains responsive and crashes are contained. Source: https://tauri.app/concept/process-model/
- Real-ESRGAN NCNN Vulkan documents image input/output, model name, scale, tile size, GPU, and model directory flags. Source: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan

## Validation Evidence

- `npm.cmd test`: passed, 5 test files, 10 tests.
- `npm.cmd run build`: passed, TypeScript compile plus Vite production build.
- `cargo test` in `src-tauri`: passed, 11 Rust tests.
- `npm test` and `npm run build` through PowerShell failed only because `npm.ps1` is blocked by local execution policy, not because the project tests failed.

## Highest Priority Findings

### P0: Desktop Security Boundary Is Too Broad

Files:
- `src-tauri/tauri.conf.json:23-26`
- `src-tauri/capabilities/default.json:6-12`
- `src-tauri/src/lib.rs:268`, `src-tauri/src/lib.rs:289`, `src-tauri/src/lib.rs:320`, `src-tauri/src/lib.rs:327`, `src-tauri/src/lib.rs:343`

Issues:
- CSP is disabled with `csp: null`.
- Asset protocol is enabled with `scope: ["**"]`, allowing broad local asset access.
- Default capability grants broad `opener:default` and `dialog:default`.
- Custom commands accept arbitrary frontend-supplied filesystem paths for upscaling, existence checks, native open, and reveal operations without command-specific scope enforcement.

Why it matters:
- Tauri docs make capabilities/scopes the app's primary IPC security boundary. This app currently relies on trust in the React WebView rather than a narrow backend policy.

Fix plan:
1. Add a CSP suitable for local Tauri assets and bundled frontend assets.
2. Replace `assetProtocol.scope: ["**"]` with explicit media/output/app-data scopes.
3. Split capabilities into dialog, opener, media-read, output-write, and diagnostics.
4. Add backend path validation for input media, output directory, reveal/open, settings, and model paths.
5. Remove or gate unused native open/reveal commands if the plugin opener path covers the actual UI need.

Fixture plan:
- Add Rust tests for accepted/rejected input paths, output paths, asset paths, and native open/reveal path validation.
- Add a simulated malicious path fixture: app data webview folder, system root, parent traversal, UNC path, and allowed media/output path.

### P0: Model Download Integrity Is Mostly Disabled

Files:
- `src-tauri/src/lib.rs:19`
- `src-tauri/src/lib.rs:83-130`
- `src-tauri/src/lib.rs:148-153`
- `src-tauri/src/lib.rs:189-211`

Issues:
- `BAKED_PUBLIC_KEY` is a zero placeholder, so remote manifest signature verification is skipped.
- Built-in model catalog hashes are empty, so downloaded `.param` and `.bin` files are accepted without SHA-256 verification.
- Model URLs are hardcoded in Rust while installed/available model state is duplicated in TypeScript.

Why it matters:
- Model files are executable-adjacent native data consumed by an external binary. Integrity should be mandatory, not optional.

Fix plan:
1. Require hashes for every built-in model entry.
2. Fail closed if the public key is unset or manifest signature is invalid.
3. Move catalog metadata to one shared manifest artifact used by Rust and generated TypeScript types.
4. Download to temp files, verify both file size and hash, then atomically rename.

Fixture plan:
- Add tests for good hash, bad hash, truncated file, oversized file, unsigned manifest, invalid signature, and interrupted resume.

### P0: Queue Cancellation Is Broken For Queued Jobs

Files:
- `src-tauri/src/job_queue.rs:140-152`
- `src-tauri/src/job_queue.rs:266-274`

Issues:
- `cancel_job` removes queued jobs by retaining only unmatched jobs, but queued jobs are not in `ACTIVE_REGISTRY`, so no cancellation event is emitted for them.
- The later "cancelled while queued" branch cannot fire for a job already removed from the queue.

User impact:
- Canceling a queued item can silently remove it while the frontend keeps waiting or displays stale state.

Fix plan:
1. Introduce a canonical `JobState` store for queued, running, succeeded, failed, cancelled.
2. Make cancellation return whether a job was queued, active, missing, or already terminal.
3. Emit a cancellation event when removing a queued job.
4. Add frontend handling for per-item cancellation, not just active job cancellation.

Fixture plan:
- Add Rust queue tests for queued cancellation, active cancellation, unknown job cancellation, and terminal-state idempotency.
- Add React tests for queue item status after cancellation event.

### P1: Output Path Reporting Can Be Wrong

Files:
- `src-tauri/src/job_queue.rs:67-80`, `src-tauri/src/job_queue.rs:94`, `src-tauri/src/job_queue.rs:109`
- `src/App.tsx:118`, `src/App.tsx:319`, `src/App.tsx:364`, `src/App.tsx:613`, `src/App.tsx:677`

Issues:
- Backend may reserve a different path than the frontend requested, but the frontend also tracks a global `pendingOutputPath`.
- Batch updates set item output paths from the global ref instead of the specific job event path.
- Collision naming hardcodes `4x` in `reserve_output_path`, even if job scale is 2x or 3x.

User impact:
- Completion card, history, Explorer reveal, and batch rows can point to the wrong output file, especially in batch runs or filename collisions.

Fix plan:
1. Treat backend event `output_path` as authoritative.
2. Replace global `pendingOutputPath` with a `jobId -> outputPath` map.
3. Pass scale into reservation or reserve before naming so collision suffixes do not lie.
4. Return the reserved output path in `run_upscale` response or first queued event.

Fixture plan:
- Add collision tests for 2x, 3x, 4x, repeated names, and batch jobs with multiple outputs.

### P1: Video Pipeline Can Produce Surprising Output Or Hang Risk

Files:
- `src-tauri/src/video_pipeline.rs:52`
- `src-tauri/src/video_pipeline.rs:61-77`
- `src-tauri/src/video_pipeline.rs:239-348`
- `src-tauri/src/video_pipeline.rs:421-464`

Issues:
- FFmpeg/FFprobe fall back to system PATH binaries, which can differ from bundled versions.
- Reassembly tries multiple encoders and can silently fall back to video-only output, dropping audio.
- The process handle used for cancellation is not updated for reassembly subprocesses, so UI cancel may not kill the current FFmpeg reassembly process.
- VFR detection falls back to `30/1` on ffprobe failure, possibly masking invalid inputs.

Fix plan:
1. Prefer and require bundled FFmpeg/FFprobe for packaged builds; allow PATH fallback only in dev diagnostics.
2. Emit explicit phase/result metadata for audio copied, audio transcoded, or audio dropped.
3. Store every active subprocess handle in the job control object during extract, upscale, and reassemble.
4. Treat ffprobe failure as a validation error unless user explicitly chooses a fallback frame rate.

Fixture plan:
- Add fixtures for CFR video with audio, CFR no audio, incompatible audio, VFR video, corrupt video, ffprobe missing, and cancellation during each phase.

### P1: Frontend Orchestration Is Overcentralized

Files:
- `src/App.tsx:64-120`
- `src/App.tsx:268-390`
- `src/App.tsx:569-735`

Issues:
- `App.tsx` owns device discovery, settings, model catalog state, file selection, queue state, job lifecycle, history, media dimension probing, toast formatting, and rendering.
- State transitions are ad hoc strings while `src/lib/types.ts:104-118` defines a state lifecycle that is not enforced in the app.

Fix plan:
1. Extract `useSettings`, `useModelCatalog`, `useMediaSelection`, `useJobQueue`, and `useJobEvents`.
2. Centralize job state transitions using `isValidStateTransition`.
3. Make batch and single-job flows share one queue API.

Fixture plan:
- Add reducer/unit tests for lifecycle transitions and integration tests for single image, batch image, and video event streams.

## Additional Findings

### P1: Folder Button Does Not Select Folders

Files:
- `src/components/DropZone.tsx:23-24`, `src/components/DropZone.tsx:77`
- `src/App.tsx:424-435`, `src/App.tsx:831`

Issue:
- The "Folder" action is wired to `handleOpenFile`, which opens a file picker with `multiple: true`, not a directory picker.

Fix plan:
- Add a dedicated folder selection command and recursive media discovery, or rename the button if folder ingestion is not supported.

### P1: Installed Model State Is Ignored In Main Selector

Files:
- `src/components/SettingsPanel.tsx:18`, `src/components/SettingsPanel.tsx:54`, `src/components/SettingsPanel.tsx:64`, `src/components/ModelCatalogModal.tsx:61`

Issue:
- `installedModels` is accepted but not used to disable/filter model selection. Users can choose models that are not installed and only fail at run time.

Fix plan:
- Disable uninstalled models in the main selector, route download from the same row, and validate selected model in Rust before enqueueing.

### P1: Sound Settings Are Ignored

Files:
- `src/App.tsx:112`
- `src/App.tsx:224`
- `src/App.tsx:336`, `src/App.tsx:342`, `src/App.tsx:439`

Issue:
- `isMuted` is hardcoded to `false`; saved `sound_muted` is loaded by type but not applied.

Fix plan:
- Promote muted state into React state, load it from settings, expose a settings toggle, and save it.

### P2: Encoding Damage In User-Facing Text

Files:
- `src/components/AboutModal.tsx`
- `src/components/AdvancedSettings.tsx`
- `src/components/BatchQueueView.tsx`
- `src/components/ComparisonSlider.tsx`
- `src/components/CompletionCard.tsx`
- `src/components/ModelCatalogModal.tsx`
- `src/components/ProgressOverlay.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/Titlebar.tsx`
- `scripts/validate-all.ps1`

Issue:
- User-visible glyphs display as mojibake in place of close buttons, middle dots, checkmarks, arrows, and scale markers.

Fix plan:
- Normalize files to UTF-8, replace damaged glyphs, then add a lightweight text scan test for common mojibake sequences.

### P2: History Is Fragile And Browser-Local Only

Files:
- `src/lib/history.ts:12-58`
- `src/App.tsx:319-330`, `src/App.tsx:769-793`

Issue:
- History uses localStorage, random short IDs, no schema migration, and no authoritative backend validation until restore.

Fix plan:
- Move history to Rust app data or a typed frontend storage adapter with schema versioning, stable IDs, and path validation.

### P2: Diagnostics And Process Tracking Are Partial

Files:
- `src-tauri/src/sidecar_manager.rs:21-25`, `src-tauri/src/sidecar_manager.rs:299-313`
- `src-tauri/src/process_runner.rs:65-99`
- `src-tauri/src/lib.rs:382-425`

Issue:
- `ACTIVE_PROCESSES` is separate from job queue process handles and `register_process` is unused.
- Process stderr is drained but not retained, so failures lose the useful engine log.
- Diagnostics probe encoders by launching commands synchronously without timeout.

Fix plan:
- Unify process lifecycle tracking under job control, store tail logs per job, and add timeout-wrapped diagnostics.

### P2: Test Coverage Misses Real Product Behavior

Files:
- `vitest.config.ts:8`
- `src/components/__tests__/*.test.tsx`
- Rust unit tests in `src-tauri/src/*.rs`

Issue:
- Current tests verify basic rendering and helper functions, but not IPC payloads, path policy, model integrity, queue semantics, real output paths, or video pipeline behavior.

Fix plan:
- Add Rust service-level tests with mock process runners, React hook/reducer tests, and one Tauri-level smoke test for command contracts.

### P2: Benchmark Script Is Not A True Benchmark Yet

Files:
- `scripts/benchmark.ts:34-122`
- `tests/fixtures/corpus_manifest.json`

Issue:
- Benchmark hashes fixture inputs instead of invoking the upscaler, sets `passed: true` regardless of hash match, uses hardcoded sidecar info, and relies on system FFmpeg.

Fix plan:
- Make benchmark run the actual command pipeline, fail on pixel hash mismatch, record real elapsed time and sidecar version, and make missing fixtures fail clearly.

### P3: Duplicate Copied Design Handoff Tree Should Not Be Product Source

Files:
- `claude_design_handoffs/**`

Issue:
- The repository contains a full copied frontend project and many images under handoff paths. These duplicate real `src/**` files and can confuse searches, audits, and future edits.

Fix plan:
- Move handoff artifacts under `docs/handoffs/` or archive outside product source, then add explicit ignore/search rules.

## File Category Audit Notes

- Product frontend source: `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/App.css`, `src/vite-env.d.ts`, `src/test/setup.ts`, `src/lib/*.ts`, `src/components/*.tsx`, and `src/components/__tests__/*.tsx` reviewed.
- Native backend source: `src-tauri/src/*.rs`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/main.rs`, `src-tauri/tauri.conf.json`, and `src-tauri/capabilities/default.json` reviewed.
- Scripts: `scripts/*.ps1`, `scripts/*.sh`, and `scripts/benchmark.ts` reviewed by source where relevant; validation scripts also show mojibake.
- Docs/config: `README.md`, `PROJECT_RULES.md`, `GSD-STYLE.md`, `model_capabilities.yaml`, `docs/*.md`, `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore` reviewed for role and consistency.
- Assets/binaries/models: `src-tauri/models/*`, `src-tauri/binaries/*.dll`, `src-tauri/icons/*`, `public/*.svg`, `src/assets/react.svg`, root archives/installers/images reviewed as packaging/assets. Risks are mostly provenance, size, source-control hygiene, and integrity metadata.
- Generated/build/dependency folders: `node_modules`, `dist`, `.git`, and benchmark reports were not source-audited line-by-line.

## Recommended Execution Order

1. Security hardening: CSP, asset scope, capabilities, command path validation.
2. Model integrity: hashes, signed manifest, single catalog source of truth.
3. Queue correctness: canonical job state, queued cancellation events, output path authority.
4. Video pipeline resilience: subprocess tracking, ffprobe failure policy, explicit audio outcome.
5. Frontend architecture: extract hooks/reducers and enforce lifecycle transitions.
6. UX correctness: folder import, installed-model filtering, sound setting, encoding cleanup.
7. Test expansion: fixtures for the above and CI commands for `npm.cmd test`, `npm.cmd run build`, and `cargo test`.



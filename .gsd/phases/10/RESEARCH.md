---
phase: 10
level: 1
researched_at: 2026-08-09
---

# Phase 10 Research: Split/Cache Model Catalog Resolution

## Questions Investigated
1. **How to split `parse_ncnn_param` in `param_parser.rs` to reduce cognitive complexity?**
   - Decompose `parse_ncnn_param` into modular helper functions:
     - `read_header`: Parses magic number, layer_count, and blob_count from line 1.
     - `parse_layer_line`: Identifies layer type and dispatches to layer-specific parameter inspectors.
     - `parse_layer_params`: Iterates key=value tokens.
     - `scale_factor_for_layer`: Calculates layer-specific scaling factor (`Interp`, `Deconv`, `PixelShuffle`).
   - Replaces `scale_val.round() as u32` with safe integer conversion.

2. **How to add caching for `.param` parsing in `model_store.rs`?**
   - Maintain a thread-safe `PARAM_CACHE` (`Mutex<HashMap<PathBuf, (SystemTime, ModelMetadata)>>`).
   - If the file's `modified()` timestamp matches the cached entry, reuse the cached `ModelMetadata` instead of reading and parsing disk contents on every catalog call.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Param Parser Decomposition | 4 modular helper functions (`read_header`, `parse_layer_line`, `parse_layer_params`, `scale_factor_for_layer`) | Brings cognitive complexity from 31 down to <=15 and enables isolated unit testing of each layer type |
| Model Store Caching | File modification time (`mtime`) cache key | Prevents redundant disk reads while immediately invalidating when a model file is modified or redownloaded |

## Verification Strategy
- `cargo test --manifest-path src-tauri/Cargo.toml`
- Unit tests covering all NCNN layer types and header scenarios in `param_parser.rs`.
- `npm.cmd run check:ts` & `npm test`.

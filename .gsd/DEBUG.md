# Debug Session: UI Split View & Tile Scanner Grid Fix

## Symptom
1. **Tile Scanner Overlay**: When clicking "Upscale", no scanning tile animation appeared over the media frame (img2).
2. **Split/Side Comparison View**: After upscaling completed, the right side of the comparison slider remained completely black/empty (img3, img4, img5).

## Hypotheses & Evidence

### H1: Grid Overlay Positioning & Styling (CONFIRMED)
- **Evidence**: The 8x6 tile grid overlay was rendered inside the outer stage container (`motion.div inset-0`) spanning the entire window backdrop instead of bounding directly to the media element (`<img>`/`<video>`).
- **Fix**: Wrapped processing media inside an inline-flex frame container (`position: relative`) and placed the 8x6 scanning grid directly inside it, styled with bright red glowing pulse borders (`#FF3B5C`) and dashed grid lines.

### H2: Temporary File System Lock / Asset Loading Race Condition (CONFIRMED)
- **Evidence**: While NCNN writes the upscaled file to disk (561KB PNG), the React component attempted to load `outputSrc` before the OS flushed the file buffer. `img2.onerror` triggered immediately and locked `outputError = true`, rendering the black empty error fallback.
- **Fix**:
  1. Updated `ComparisonSlider` to use `getMediaSrc` for robust URL formatting.
  2. Implemented an automatic retry handler with cache-busting timestamp fallback (`${outputSrc}?t=${Date.now()}`) when loading freshly written output files.
  3. Reset `outputError` state on source updates.

## Verification
- **Rust Backend**: `11/11` unit tests passed (`cargo test`).
- **React Frontend**: `17/17` Vitest tests passed (`npm run test`).
- **Git Commit**: `bf82a0c`.

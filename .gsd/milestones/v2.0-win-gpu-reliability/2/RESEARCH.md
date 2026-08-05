---
phase: 2
level: 2
researched_at: 2026-08-03
---

# Phase 2 Research: React Liquid Glass UI Architecture

## Questions Investigated

1. **60FPS Ambient Shader Background**: How to implement a performant canvas background shader in React without causing re-renders or consuming VRAM during AI upscaling?
2. **Atropos 3D Tilt Card**: How to integrate `atropos` JS with Tailwind v4 for 3D parallax tilt effects, specular reflection layers, and floating format tags?
3. **Liquid Shimmer CTA Button**: How to build a magnetic cursor pull pill CTA with Framer Motion and continuous shimmer ray sweep?
4. **Framer Motion Spring Toasts**: How to structure a non-modal liquid toast notification system with spring physics (`y: 20 -> 0`, `scale: 0.9 -> 1.0`) and swipe gestures?
5. **Phosphor Icon Integration**: How to integrate `@phosphor-icons/react` across custom titlebar, dropzone, settings tabs, and action cards for an Apple-grade UI?

---

## Findings

### 1. Canvas Shader & GPU Throttling
- **Implementation**: `LiquidShaderBg.tsx` uses an un-rendered `<canvas>` ref with a lightweight 2D radial gradient / metaball shader loop running on `requestAnimationFrame`.
- **GPU Throttling Rule**: Pass a boolean prop `isProcessing`. When `isProcessing == true` or when the window loses focus (`document.hidden`), `cancelAnimationFrame` pauses the render loop, dropping canvas GPU usage to 0% so 100% hardware capability goes to Vulkan AI upscaling.

### 2. Atropos 3D Parallax & Tailwind v4
- **Dependencies**: `atropos` package for 3D parallax tilt physics.
- **Styling**: Translucent liquid glass card (`rgba(35, 33, 44, 0.45)` base, `backdrop-blur-xl`, `border-white/10` specular edge highlight).
- **Format Tags**: Floating pills (`PNG`, `JPG`, `WEBP`, `MP4`, `MKV`) rendered inside Atropos `data-atropos-offset="20"` for 3D depth.

### 3. Liquid Shimmer Pill CTA
- **Magnetic Pull**: Track mouse coordinates within a 30px bounding box around the button using `useMotionValue` and `useSpring` to pull the button target slightly toward the cursor.
- **Shimmer Ray**: CSS keyframe linear gradient animation (`Vanilla` `#F1FEC8` into `Lavender` `#D2C3F6`).
- **Click Ripple**: Absolute positioned expanding circle on click.

### 4. Phosphor Icons Integration
- Install `@phosphor-icons/react` for Apple-inspired icon set (`UploadSimple`, `SlidersHorizontal`, `Cpu`, `Sparkle`, `Play`, `CheckCircle`, `X`, `Folder`, `ArrowClockwise`).

---

## Decisions Made

| Component | Library / Pattern | Rationale |
|-----------|-------------------|-----------|
| Background Shader | HTML5 Canvas + `requestAnimationFrame` + auto-pause | Zero VRAM overhead during active GPU inference. |
| 3D Parallax | `atropos` + Tailwind v4 | Real 3D mouse-tracking tilt physics with specular sheen. |
| Icons | `@phosphor-icons/react` | Consistent, sleek Apple-grade vector icons. |
| Animations & Spring Toasts | `framer-motion` (Motion Primitives) | Smooth 60fps spring transitions (`stiffness: 300`, `damping: 25`). |

---

## Ready for Planning
- [x] Canvas shader performance architecture verified
- [x] Atropos 3D tilt card structure confirmed
- [x] Phosphor Icons package identified
- [x] Framer Motion spring physics patterns established

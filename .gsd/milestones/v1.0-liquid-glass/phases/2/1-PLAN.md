---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Dependencies, Design System Tokens & Base Components

## Objective
Install frontend animation and icon dependencies, configure Liquid Dark Theme CSS tokens (`Cosmic`/`Violet`/`Lavender`/`Vanilla`), and build the mouse-reactive 60fps ambient shader background and custom frameless titlebar.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/2/RESEARCH.md`
- `package.json`
- `src/App.css`
- `src/components/LiquidShaderBg.tsx`
- `src/components/Titlebar.tsx`

## Tasks

<task type="auto">
  <name>Install dependencies & setup Liquid Dark design tokens</name>
  <files>package.json, src/App.css</files>
  <action>
    1. Install `@phosphor-icons/react`, `framer-motion`, and `atropos` using npm.
    2. Configure Liquid Dark Theme design tokens in `src/App.css`:
       - Base colors: `Cosmic` (`#23212C`), `Violet` (`#36255C`)
       - Accents: `Lavender` (`#D2C3F6`), `Vanilla` (`#F1FEC8`)
       - Glass utilities: translucent liquid surfaces (`backdrop-blur-xl`, specular edge reflections).
  </action>
  <verify>npm run build</verify>
  <done>Dependencies installed cleanly and CSS tokens configured</done>
</task>

<task type="auto">
  <name>Build LiquidShaderBg and Titlebar components</name>
  <files>src/components/LiquidShaderBg.tsx, src/components/Titlebar.tsx, src/App.tsx</files>
  <action>
    1. Build `src/components/LiquidShaderBg.tsx` HTML5 canvas background shader with 60fps mouse-reactive light orbs, and auto-pause when processing or hidden.
    2. Build `src/components/Titlebar.tsx` custom floating frameless header with glass pill window controls (`minimize`, `maximize`, `close`), drag handle strip, app logo, and status badge.
    3. Update `src/App.tsx` to mount `LiquidShaderBg` and `Titlebar`.
  </action>
  <verify>npm run build</verify>
  <done>Ambient canvas shader renders at 60fps and titlebar window controls handle drag/minimize/close</done>
</task>

## Success Criteria
- [ ] `npm run build` succeeds with 0 TypeScript errors
- [ ] Ambient liquid canvas shader renders mouse-reactive light orbs at 60fps
- [ ] Titlebar renders custom window control pills and drag region

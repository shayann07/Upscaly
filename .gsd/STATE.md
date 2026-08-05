# GSD Application State

> **Project**: Upscaly
> **Status**: Phase 5 Planned ⬜

## Current Position
- **Milestone**: `v2.0-win-gpu-reliability`
- **Phase**: Phase 5: Apply Only Output-Preserving GPU Optimizations
- **Status**: Phase 5 planned and ready for execution

## Last Session Summary
Defined Phase 5 execution plan in `.gsd/phases/phase-5-plan.md`.
- **Thread Profiling**: Dynamic `-j load:proc:save` selection (`4:4:4` for <=4MP, `2:2:2` for >=12MP / video, `1:2:2` for others).
- **Tile Clamping**: Default tile size `-t 0` (auto); clamp user values to multiples of 32 (32-1024).
- **TTA Documentation**: Update UI tooltips to clarify `-x` is Test-Time Augmentation.
- **Output Preservation**: Guarantee zero lossy downscaling or model substitution.

## Next Steps
- Run `/execute 5` to execute Phase 5 tasks.

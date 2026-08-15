/**
 * Types generated from the Rust IPC boundary by ts-rs.
 *
 * Do not hand-edit the sibling files -- run `npm run gen:types` and commit
 * the result. CI regenerates and fails on any diff, so a backend struct
 * change the frontend has not been updated for is caught there rather than
 * at runtime.
 *
 * This exists to close a recurring class of bug in this codebase: the two
 * sides described the same payload independently and drifted apart (the
 * duplicated model catalogs, the two output-path schemes and the two status
 * vocabularies were all instances of it).
 */
export type { AppErrorPayload } from './AppErrorPayload';
export type { AppSettings } from './AppSettings';
export type { FullModelInfo } from './FullModelInfo';
export type { GpuDevice } from './GpuDevice';
export type { JobSnapshot } from './JobSnapshot';
export type { JobsDelta } from './JobsDelta';
export type { OutputFormat } from './OutputFormat';
export type { QualityPreset } from './QualityPreset';
export type { UpscaleJobHandle } from './UpscaleJobHandle';
export type { UpscaleRequest } from './UpscaleRequest';
export type { VramProfile } from './VramProfile';

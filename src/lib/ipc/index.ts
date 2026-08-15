/**
 * Types generated from the Rust IPC boundary by ts-rs.
 *
 * Do not hand-edit anything in this directory -- run `npm run gen:types` and
 * commit the result. CI regenerates and fails on any diff, so a backend
 * struct change that the frontend has not been updated for is caught there
 * rather than at runtime.
 *
 * This is the fix for a recurring class of bug in this codebase: the two
 * sides described the same payload independently and drifted apart (the
 * duplicated model catalogs, two output-path schemes, and two status
 * vocabularies were all instances of it).
 */
export type { AppSettings } from './AppSettings';
export type { FullModelInfo } from './FullModelInfo';
export type { GpuDevice } from './GpuDevice';
export type { JobProgress } from './JobProgress';
export type { UpscaleJobHandle } from './UpscaleJobHandle';
export type { UpscaleRequest } from './UpscaleRequest';
export type { VramProfile } from './VramProfile';

import { AppErrorPayload } from './ipc';

/**
 * Commands now reject with a structured `AppError` rather than a bare
 * string, so `String(err)` -- which every catch block used to do -- would
 * render `[object Object]` at the user. Everything that surfaces a command
 * failure goes through here instead.
 */
function isAppErrorPayload(err: unknown): err is AppErrorPayload {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as Record<string, unknown>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

/** The human-readable half of a command failure. */
export function formatIpcError(err: unknown): string {
  if (isAppErrorPayload(err)) {
    return err.suggestion ? `${err.message} (${err.suggestion})` : err.message;
  }
  return String(err);
}

/**
 * The machine-readable half, or `null` for anything that did not come from
 * the backend's typed errors. Callers that need to branch on *why* something
 * failed test this rather than matching on the message text -- the whole
 * point of the code being separate from the wording.
 */
export function ipcErrorCode(err: unknown): string | null {
  return isAppErrorPayload(err) ? err.code : null;
}

/** Whether a failure was the user stopping the job rather than a fault. */
export function isCancellationError(err: unknown): boolean {
  return ipcErrorCode(err) === 'CANCELLED';
}

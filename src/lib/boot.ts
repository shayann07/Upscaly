/**
 * Drives the static boot overlay in index.html, and owns when the native
 * window first becomes visible.
 *
 * That markup paints before any of this bundle has been parsed, so it is
 * the only thing available during the slowest part of a cold start. React
 * cannot own it, because React is exactly what has not started yet.
 *
 * # Why this module shows the window
 *
 * The window is created hidden (`visible: false` in tauri.conf.json) and
 * put on screen by `show_main_window`, called from here. Every signal the
 * backend could key on instead -- window creation, page load -- fires
 * before the frontend has painted what the user should see, so showing the
 * window from Rust always risked a frame of the wrong thing: the flat
 * `backgroundColor` fill before the first paint, or a bare striped page
 * while the splash played out in a window nobody could see. Exactly one
 * owner decides what the first visible frame contains, and it is the code
 * that paints those frames.
 *
 * # Why launch time comes from the backend
 *
 * Whether a launch deserves a splash is decided on *real* time since the
 * process launched, fetched over IPC -- not `performance.now()`. The page
 * clock starts at navigation, and the expensive part of a cold start
 * (process spawn, WebView2 runtime init) is spent before navigation
 * begins. Judged by the page clock, every launch looks warm -- which is
 * exactly how the splash ended up never showing on the launches that
 * needed it.
 *
 * # Why #root is hidden rather than covered
 *
 * React mounts the moment the bundle executes, well before the GPU list or
 * saved settings arrive, so the dashboard exists in a half-initialised
 * state long before it should be looked at. Merely layering something on
 * top is not enough: an earlier version faded the overlay in over 180ms,
 * and during that window the unfinished dashboard was plainly visible
 * underneath -- it appeared, disappeared behind the splash, then came
 * back. `#root` is therefore hidden outright until hand-over, and exactly
 * one of the two is ever on screen.
 */
import { invoke } from '@tauri-apps/api/core';

const OVERLAY_ID = 'boot';
const STATUS_ID = 'boot-status';
const NAME_ID = 'boot-name';
const ROOT_ID = 'root';

/**
 * Real time since process launch above which a start counts as cold and
 * earns a splash.
 *
 * Sized against what each side of it actually costs. A warm launch --
 * process spawn, warm WebView2 attach, navigation, bundle -- lands well
 * under this; a genuinely cold one carries WebView2 runtime init and a
 * Defender scan of the freshly mapped binary, and lands well over it. The
 * gap between those two populations is wide; a threshold inside either
 * one's jitter would reintroduce the launch-to-launch inconsistency that
 * plagued every earlier version of this file.
 */
const COLD_LAUNCH_MS = 1000;
/**
 * Once visible, how long the splash stays. Sized to let its entrance
 * choreography (mark, wordmark, status) land rather than to pad the wait.
 * A transition that lingers is impressive twice and tiresome every launch
 * after.
 */
const MIN_VISIBLE_MS = 450;

/**
 * How long the hand-over itself takes, chosen from how long the launch
 * actually was. A quick start gets a quick exit -- drawing out the
 * departure of a splash the user barely saw feels disproportionate. A
 * genuinely slow start has already made them wait, so it gets a slightly
 * calmer settle rather than snapping away.
 */
const EXIT_FAST_MS = 300;
const EXIT_CALM_MS = 460;
/** Above this (real launch time), startup earns the calmer exit. */
const SLOW_START_MS = 2500;

/**
 * Offset from the page clock to the real launch clock, learned in
 * {@link bootArm}. Zero until then, and zero outside Tauri -- where the
 * page clock is all there is.
 */
let realSkewMs = 0;
const realNow = () => performance.now() + realSkewMs;

let handedOver = false;
let revealTimer: number | undefined;
/** Page-clock time the splash actually painted; `undefined` if it never has. */
let shownAt: number | undefined;
let windowShown = false;

const inTauri = () => '__TAURI_INTERNALS__' in window;

/**
 * Puts the native window on screen. Called only once something is painted
 * for it to show -- the splash, or the revealed app.
 */
function showWindow(): void {
  if (windowShown) return;
  windowShown = true;
  // Outside Tauri (vitest, a plain browser preview) there is no hidden
  // native window; the page is simply already visible.
  if (!inTauri()) return;
  void invoke('show_main_window').catch(() => {});
}

function exitDurationMs(): number {
  return realNow() >= SLOW_START_MS ? EXIT_CALM_MS : EXIT_FAST_MS;
}

/** Narrates a startup step. No-op once the app has taken over. */
export function bootStatus(text: string): void {
  if (handedOver) return;
  const el = document.getElementById(STATUS_ID);
  if (el) el.textContent = text;
}

/** Updates the product name on the splash if it is still up. */
export function bootName(text: string): void {
  if (handedOver) return;
  const el = document.getElementById(NAME_ID);
  if (el) el.textContent = text;
}

/**
 * Arms the splash. Called once, as early as the bundle can manage.
 *
 * A launch already past {@link COLD_LAUNCH_MS} shows the splash (and the
 * window) immediately -- the wait it exists to cover is already underway.
 * A younger launch waits out the remainder: if startup completes first the
 * timer is cancelled and no splash ever paints, which is the entire warm
 * path.
 */
export async function bootArm(): Promise<void> {
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;

  const show = () => {
    revealTimer = undefined;
    if (handedOver) return;
    shownAt = performance.now();
    el.classList.add('boot-show');
    showWindow();
  };

  // Armed on the page clock before anything is awaited, so a slow or
  // wedged `launch_elapsed_ms` can never be what stops the splash from
  // ever painting.
  revealTimer = window.setTimeout(show, COLD_LAUNCH_MS);

  if (inTauri()) {
    try {
      const elapsed = await invoke<number>('launch_elapsed_ms');
      if (typeof elapsed === 'number') realSkewMs = elapsed - performance.now();
    } catch {
      // Page clock it is.
    }
  }
  if (handedOver) return;
  if (revealTimer !== undefined) {
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(show, Math.max(0, COLD_LAUNCH_MS - realNow()));
  }
}

/**
 * Makes the app visible.
 *
 * Both paths fade; they differ in how much ceremony they get.
 *
 * `fromSplash` gates the staggered choreography (titlebar, then content),
 * which is the hand-over *from the splash* -- a moment the user is already
 * watching. A warm start never painted a splash, so there is nothing to
 * hand over from and the stagger would be ceremony over an empty window.
 * It still gets a short plain fade: flipping `visibility` alone dropped
 * the whole dashboard in on one frame, and that hard cut reads as a blink.
 */
function revealApp(fromSplash: boolean): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.classList.add('app-ready');
  root.classList.add(fromSplash ? 'app-entering' : 'app-revealing');
}

function finish(el: HTMLElement | null): void {
  handedOver = true;
  // The app is revealed first so it is already painted underneath as the
  // overlay clears. Revealing afterwards would expose the bare window
  // background through the gap.
  revealApp(true);
  if (!el) return;
  const ms = exitDurationMs();
  // Set on the element so the CSS animation and the removal timer cannot
  // disagree about the duration.
  el.style.animationDuration = `${ms}ms`;
  el.classList.add('boot-leave');
  el.style.pointerEvents = 'none';
  window.setTimeout(() => el.remove(), ms);
}

/**
 * Signals that startup has finished and the real UI can be shown.
 *
 * Idempotent, because it is called both when startup completes normally
 * and from a failsafe timer -- a bootstrap step that hangs (an unreachable
 * update endpoint, a wedged GPU probe) must never leave the user looking
 * at a splash forever, especially since the window has no title bar of its
 * own while the overlay is up.
 */
export function bootComplete(): void {
  if (handedOver) return;
  const el = document.getElementById(OVERLAY_ID);

  // The splash never painted -- a warm start, or startup finishing inside
  // the arming await. Hand straight over; the revealed app is the first
  // frame worth showing, so the window appears with it.
  if (shownAt === undefined) {
    if (revealTimer !== undefined) {
      window.clearTimeout(revealTimer);
      revealTimer = undefined;
    }
    handedOver = true;
    revealApp(false);
    el?.remove();
    showWindow();
    return;
  }

  // Held from when the splash actually painted -- not from page start,
  // and not from arming. Every other epoch drifted from what the user
  // saw: measured from page start, a slow launch's minimum had "expired"
  // before the splash existed, and it was torn down in the frame it
  // arrived.
  const remaining = MIN_VISIBLE_MS - (performance.now() - shownAt);
  if (remaining <= 0) {
    finish(el);
    return;
  }
  window.setTimeout(() => finish(el), remaining);
}

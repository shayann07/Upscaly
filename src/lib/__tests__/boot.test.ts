import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Imported as text rather than read from disk: this project has no Node
// types, and `?raw` goes through the same resolver the app itself uses.
import indexHtml from '../../../index.html?raw';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

/**
 * The overlay lives in index.html rather than in a component, so these
 * rebuild that markup by hand. If the ids or class names here drift from
 * index.html the helpers silently become no-ops -- the splash never
 * leaves, or the app never becomes visible.
 */
function mountBootMarkup() {
  document.body.innerHTML = `
    <div id="root"></div>
    <div id="boot"><div class="boot-status" id="boot-status">STARTING</div></div>
  `;
}

/**
 * Pins the page clock, since hand-over waits on a minimum on-screen time.
 * Outside Tauri (as here, by default) the module falls back to this clock
 * for the cold/warm decision too.
 */
async function bootAt(nowMs: number) {
  vi.resetModules();
  vi.spyOn(performance, 'now').mockReturnValue(nowMs);
  return import('../boot');
}

/**
 * Simulates running inside Tauri: `launch_elapsed_ms` answers with real
 * time since the process launched, and `show_main_window` is recorded.
 */
function mockTauri(launchElapsedMs: number) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invokeMock.mockImplementation((cmd: string) =>
    Promise.resolve(cmd === 'launch_elapsed_ms' ? launchElapsedMs : undefined)
  );
}

const windowShowCalls = () =>
  invokeMock.mock.calls.filter((c) => c[0] === 'show_main_window').length;

const root = () => document.getElementById('root');
const overlay = () => document.getElementById('boot');
const appVisible = () => root()?.classList.contains('app-ready') ?? false;
const appAnimated = () => root()?.classList.contains('app-entering') ?? false;
const appFaded = () => root()?.classList.contains('app-revealing') ?? false;
const splashVisible = () => overlay()?.classList.contains('boot-show') ?? false;

beforeEach(() => {
  vi.useFakeTimers();
  invokeMock.mockReset();
  mountBootMarkup();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe('boot overlay presentation', () => {
  it('narrates the current startup step', async () => {
    const { bootStatus } = await bootAt(0);
    bootStatus('DETECTING GPUS');
    expect(document.getElementById('boot-status')?.textContent).toBe('DETECTING GPUS');
  });

  it('never shows the splash on a warm start', async () => {
    // The whole point of the arming delay: a warm start is ready in ~60ms,
    // so the splash must not paint at all rather than flashing for a few
    // frames.
    const { bootArm, bootComplete } = await bootAt(60);
    await bootArm();
    bootComplete();

    expect(splashVisible()).toBe(false);
    expect(overlay()).toBeNull();
    expect(appVisible()).toBe(true);
    // No staggered choreography: with no splash there is nothing to hand
    // over from, so the ceremony would play over an empty window.
    expect(appAnimated()).toBe(false);
    // But it still fades. Flipping `visibility` alone dropped the whole
    // dashboard in on a single frame off a blank striped window, which is
    // exactly the blink this is here to prevent.
    expect(appFaded()).toBe(true);
  });

  it('plays the entrance only when the splash was actually shown', async () => {
    const { bootArm, bootComplete } = await bootAt(0);
    await bootArm();
    vi.advanceTimersByTime(1050);
    vi.spyOn(performance, 'now').mockReturnValue(9000);
    bootComplete();
    expect(appVisible()).toBe(true);
    expect(appAnimated()).toBe(true);
    // The two are exclusive -- stacking both would run a 0.18s and a
    // 0.42s animation on the same element.
    expect(appFaded()).toBe(false);
  });

  it('keeps the app hidden until hand-over', async () => {
    // The bug this guards: React mounts long before the GPU list arrives,
    // so an unfinished dashboard was visible under the overlay -- it
    // appeared, vanished behind the splash, then returned.
    const { bootArm } = await bootAt(0);
    await bootArm();
    expect(appVisible()).toBe(false);
  });

  it('reveals the splash once startup passes the cold threshold', async () => {
    const { bootArm } = await bootAt(0);
    await bootArm();
    expect(splashVisible()).toBe(false);
    vi.advanceTimersByTime(1050);
    expect(splashVisible()).toBe(true);
  });

  it('decides cold starts on real launch time, not the page clock', async () => {
    // The defect every earlier version shared: `performance.now()` starts
    // at navigation, and a cold start's cost -- process spawn, WebView2
    // runtime init -- is spent before navigation. This launch is 5s old
    // but the page clock reads 200ms; judged by the page clock it would
    // count as warm and show no splash at all.
    const { bootArm } = await bootAt(200);
    mockTauri(5000);
    await bootArm();
    vi.advanceTimersByTime(1);
    expect(splashVisible()).toBe(true);
  });

  it('shows the window together with the splash on a cold start', async () => {
    // The window is created hidden. If the splash paints without showing
    // it, the whole splash plays inside a window nobody can see -- which
    // is exactly what happened when Rust showed the window on page load.
    const { bootArm } = await bootAt(200);
    mockTauri(5000);
    await bootArm();
    expect(windowShowCalls()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(splashVisible()).toBe(true);
    expect(windowShowCalls()).toBe(1);
  });

  it('shows the window only at hand-over on a warm start', async () => {
    // Shown any earlier, the first visible frame is the bare striped page
    // rather than the dashboard.
    const { bootArm, bootComplete } = await bootAt(60);
    mockTauri(300);
    await bootArm();
    expect(windowShowCalls()).toBe(0);
    bootComplete();
    expect(appVisible()).toBe(true);
    expect(windowShowCalls()).toBe(1);
  });
});

describe('boot overlay timing and failsafes', () => {
  it('holds a late splash for its full minimum, not zero', async () => {
    // The cold-start regression: the hold was once measured from page
    // start, so by the time a slow launch got here the minimum had
    // already "expired" and the splash was torn down in the same frame it
    // appeared -- present in the DOM, never visible on screen.
    const { bootArm, bootComplete } = await bootAt(1800);
    await bootArm();
    vi.advanceTimersByTime(1);
    expect(splashVisible()).toBe(true);

    bootComplete();
    expect(appVisible()).toBe(false);

    vi.runAllTimers();
    expect(appVisible()).toBe(true);
  });

  it('holds a revealed splash long enough for its entrance to finish', async () => {
    // The mark/wordmark/status stagger runs ~780ms; cutting it off part
    // way through looks broken, so a revealed splash is not torn down the
    // instant startup happens to finish.
    const { bootArm, bootComplete } = await bootAt(0);
    await bootArm();
    vi.advanceTimersByTime(1050);
    expect(splashVisible()).toBe(true);

    vi.spyOn(performance, 'now').mockReturnValue(300);
    bootComplete();
    expect(appVisible()).toBe(false);

    vi.runAllTimers();
    expect(appVisible()).toBe(true);
    expect(overlay()).toBeNull();
  });

  it('hands over immediately when startup already outlasted the minimum', async () => {
    const { bootArm, bootComplete } = await bootAt(0);
    await bootArm();
    vi.advanceTimersByTime(1050);

    vi.spyOn(performance, 'now').mockReturnValue(9000);
    bootComplete();
    expect(appVisible()).toBe(true);
    vi.runAllTimers();
    expect(overlay()).toBeNull();
  });

  it('reveals the app before the overlay is removed, never between', async () => {
    // Revealing after the exit animation would expose the bare window
    // background through the gap.
    const { bootArm, bootComplete } = await bootAt(0);
    await bootArm();
    vi.advanceTimersByTime(1050);
    vi.spyOn(performance, 'now').mockReturnValue(9000);
    bootComplete();

    expect(appVisible()).toBe(true);
    expect(overlay()).not.toBeNull();
  });

  it('exits briskly after a quick start and more calmly after a slow one', async () => {
    // Drawing out the departure of a splash the user barely saw feels
    // disproportionate; a start that already made them wait earns a settle
    // rather than a snap.
    const quick = await bootAt(0);
    await quick.bootArm();
    vi.advanceTimersByTime(1050);
    vi.spyOn(performance, 'now').mockReturnValue(1200);
    quick.bootComplete();
    vi.runAllTimers();
    const briskMs = Number(
      (document.getElementById('boot')?.style.animationDuration ?? '0ms').replace('ms', '')
    );

    mountBootMarkup();
    const slow = await bootAt(0);
    await slow.bootArm();
    vi.advanceTimersByTime(1050);
    vi.spyOn(performance, 'now').mockReturnValue(9000);
    slow.bootComplete();
    const calmMs = Number(
      (document.getElementById('boot')?.style.animationDuration ?? '0ms').replace('ms', '')
    );

    expect(calmMs).toBeGreaterThan(briskMs);
  });

  it('is safe to complete twice', async () => {
    // Both the normal path and the failsafe timer call this, and they can
    // race.
    const { bootArm, bootComplete } = await bootAt(60);
    await bootArm();
    bootComplete();
    expect(() => bootComplete()).not.toThrow();
    vi.runAllTimers();
    expect(overlay()).toBeNull();
  });

  it('only toggles classes that index.html actually styles', async () => {
    // These class names exist as bare strings in two files that nothing
    // links together. A typo on either side is silent: the app still
    // becomes visible, it just stops fading, which is precisely the
    // regression this suite exists to catch.
    for (const selector of ['#root.app-ready', '#root.app-entering', '#root.app-revealing']) {
      expect(indexHtml).toContain(selector);
    }
    expect(indexHtml).toContain('id="boot-status"');
  });

  it('does not throw when the markup is absent', async () => {
    // Vitest and any non-Tauri preview render without index.html's overlay.
    document.body.innerHTML = '';
    const { bootArm, bootStatus, bootComplete } = await bootAt(9000);
    await expect(bootArm()).resolves.toBeUndefined();
    expect(() => bootStatus('DETECTING GPUS')).not.toThrow();
    expect(() => bootComplete()).not.toThrow();
  });

  it('reveals splash after COLD_LAUNCH_MS even if launch_elapsed_ms never resolves', async () => {
    const { bootArm } = await bootAt(0);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'launch_elapsed_ms') return new Promise(() => {});
      return Promise.resolve(undefined);
    });

    void bootArm();
    expect(splashVisible()).toBe(false);
    vi.advanceTimersByTime(1050);
    expect(splashVisible()).toBe(true);
  });

  it('reveals app via failsafe timer when startup hangs', async () => {
    const { bootArm, bootComplete } = await bootAt(0);
    await bootArm();
    vi.advanceTimersByTime(1050);
    expect(splashVisible()).toBe(true);

    // Simulate 4s failsafe triggering bootComplete
    vi.advanceTimersByTime(4000);
    bootComplete();
    vi.runAllTimers();
    expect(appVisible()).toBe(true);
    expect(overlay()).toBeNull();
  });
});

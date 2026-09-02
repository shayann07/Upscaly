document.getElementById('boot-close')?.addEventListener('click', function () {
  var t = window.__TAURI_INTERNALS__;
  if (t && t.invoke) t.invoke('close_window').catch(function () {});
});

/**
 * Reveals the close button. Not shown on a normal cold launch -- only
 * once startup is either confirmed broken (a render error) or has taken
 * long enough that something is very likely wrong. Runs entirely in this
 * pre-bundle script rather than from React, because the scenario this
 * exists for is exactly the bundle never getting that far.
 */
function revealBootClose() {
  var b = document.getElementById('boot-close');
  if (b) {
    b.style.opacity = '1';
    b.style.pointerEvents = 'auto';
  }
}

window.addEventListener('error', function () {
  var s = document.getElementById('boot-status');
  if (s) s.textContent = 'STARTUP FAILED';
  revealBootClose();
});

// 12s is well past even a slow, legitimate cold start (WebView2 init plus
// a Defender scan of the freshly installed binary) -- boot.ts's own
// splash threshold is 1s, and real cold starts land well under this. If
// #boot is still in the DOM by then, startup did not hand off, and there
// is no other way to close the window.
setTimeout(function () {
  if (document.getElementById('boot')) revealBootClose();
}, 12000);

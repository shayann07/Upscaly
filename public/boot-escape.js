document.getElementById('boot-close')?.addEventListener('click', function () {
  var t = window.__TAURI_INTERNALS__;
  if (t && t.invoke) t.invoke('close_window').catch(function () {});
});
window.addEventListener('error', function () {
  var s = document.getElementById('boot-status');
  if (s) s.textContent = 'STARTUP FAILED — CLICK ✕ TO CLOSE';
});

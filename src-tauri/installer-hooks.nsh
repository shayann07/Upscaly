; Installer hooks for Upscaly.
;
; ffmpeg and ffprobe are ~290MB together and GPL-licensed. Bundling them
; would put a copyleft payload inside an MIT-licensed installer and triple
; its size, so the installer fetches them from upstream instead. Upscaly
; therefore never redistributes GPL binaries itself.
;
; All of the work is in resources\provision-ffmpeg.ps1 rather than inline
; NSIS. That script reads the pinned URL and SHA-256 hashes straight out of
; sidecar-manifest.json -- the same file scripts/fetch-sidecars.mjs uses --
; so there is one source of truth, and it can be run and tested on its own
; without building an installer.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Downloading video components (ffmpeg)..."

  ; Deliberately ignores the exit code. A failed fetch -- offline machine,
  ; captive portal, GitHub unreachable -- must not fail the installation:
  ; image upscaling never touches ffmpeg, and the app re-offers the
  ; download when a video job is actually started. Aborting here would
  ; leave a user with no app at all over an optional component.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\provision-ffmpeg.ps1" -InstallDir "$INSTDIR"'
  Pop $0

  ${If} $0 == 0
    DetailPrint "Video components installed."
  ${Else}
    DetailPrint "Video components could not be downloaded; Upscaly will fetch them on first video job."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Downloaded after install, so the uninstaller has no record of them and
  ; would otherwise leave ~290MB behind.
  Delete "$INSTDIR\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
  Delete "$INSTDIR\binaries\ffprobe-x86_64-pc-windows-msvc.exe"
  ; Non-recursive on purpose: this removes the directory only once it is
  ; empty, so anything a user put there themselves is never destroyed.
  RMDir "$INSTDIR\binaries"
!macroend

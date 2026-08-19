; Installer hooks for Upscaly Studio.
;
; ffmpeg and ffprobe are ~290MB together and GPL-licensed. Bundling them
; would put a copyleft payload inside an MIT-licensed installer and triple
; its size, so the installer fetches them from upstream instead. Upscaly Studio
; therefore never redistributes GPL binaries itself.
;
; All of the work is in resources\provision-ffmpeg.ps1 rather than inline
; NSIS. That script reads the pinned URL and SHA-256 hashes straight out of
; sidecar-manifest.json -- the same file scripts/fetch-sidecars.mjs uses --
; so there is one source of truth, and it can be run and tested on its own
; without building an installer.

!macro NSIS_HOOK_PREINSTALL
  ; v0.1.0 shipped as productName "Upscaly" with publisher "shayann07",
  ; so this build's own registry keys cannot see it. Uninstall it here:
  ; leaving it produces two apps in Add/Remove Programs, two shortcuts,
  ; and an old install that offers this very update forever.
  ReadRegStr $0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly" "UninstallString"
  ${If} $0 != ""
    ReadRegStr $1 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly" "InstallLocation"
    ; Strip surrounding quotes the installer writes around the path.
    StrCpy $2 $1 1
    ${If} $2 == '"'
      StrLen $3 $1
      IntOp $3 $3 - 2
      StrCpy $1 $1 $3 1
    ${EndIf}
    DetailPrint "Removing previous Upscaly 0.1.0 install"
    ; /UPDATE preserves nothing we need -- run a plain silent uninstall.
    ExecWait '$0 /S _?=$1'
    Delete "$0"
    RMDir "$1"
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly"
    DeleteRegKey SHCTX "Software\shayann07\Upscaly"
    Delete "$SMPROGRAMS\Upscaly.lnk"
  ${EndIf}
!macroend

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
    DetailPrint "Video components could not be downloaded; Upscaly Studio will fetch them on first video job."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Repair $INSTDIR before anything tries to delete through it.
  ;
  ; The generated uninstaller only runs MULTIUSER_UNINIT when installMode is
  ; "both"; on "currentUser" it is skipped, and nothing else assigns
  ; $INSTDIR when the uninstall page is not shown. A silent uninstall
  ; (`uninstall.exe /S`) therefore leaves it empty, every
  ; `Delete "$INSTDIR\..."` resolves to a bare relative path and quietly
  ; does nothing, while the registry cleanup -- which uses fixed key paths
  ; -- succeeds. Observed exactly that: the uninstaller reported success and
  ; deregistered the app, while all 297MB of it stayed on disk.
  ;
  ; This hook is inserted at the very top of Section Uninstall, before
  ; Tauri's own deletes, so recovering the path here fixes them too and not
  ; just the two files below. The location comes from the registry entry the
  ; installer wrote, which is still present at this point and is correct
  ; regardless of where the uninstaller itself is executing from.
  ${If} $INSTDIR == ""
    ReadRegStr $0 SHCTX "${UNINSTKEY}" "InstallLocation"
    ; The value is written quoted; NSIS compares and joins paths literally,
    ; so the quotes have to come off or every path below is malformed.
    ${If} $0 != ""
      StrCpy $INSTDIR $0
      StrCpy $1 $INSTDIR 1
      ${If} $1 == '"'
        StrLen $2 $INSTDIR
        IntOp $2 $2 - 2
        StrCpy $INSTDIR $INSTDIR $2 1
      ${EndIf}
      DetailPrint "Recovered install location: $INSTDIR"
    ${EndIf}
  ${EndIf}

  ; Downloaded after install, so the uninstaller has no record of them and
  ; would otherwise leave ~290MB behind on a real uninstall.
  ;
  ; Except during an update. Installing over an existing version runs the
  ; *old* uninstaller with /UPDATE first (see the generated installer.nsi,
  ; which appends that flag), so deleting unconditionally here would throw
  ; away a perfectly good ffmpeg that the new install then has to fetch
  ; again -- a 290MB download on every single update, including every
  ; auto-update. The provisioning script hashes what it finds and skips
  ; work when the files are already correct, so leaving them in place makes
  ; an update download nothing at all.
  ${If} $UpdateMode <> 1
  ${AndIf} $INSTDIR != ""
    Delete "$INSTDIR\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
    Delete "$INSTDIR\binaries\ffprobe-x86_64-pc-windows-msvc.exe"
    ; Non-recursive on purpose: this removes the directory only once it is
    ; empty, so anything a user put there themselves is never destroyed.
    RMDir "$INSTDIR\binaries"
  ${EndIf}
!macroend

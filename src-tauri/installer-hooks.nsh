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

!macro NSIS_HOOK_PREINSTALL
  ; v0.1.0 shipped as productName "Upscaly" with publisher "shayann07".
  ; Leaving it installed produces two apps in Add/Remove Programs, two
  ; shortcuts, and an old install that offers this very update forever.
  ;
  ; The publisher check is load-bearing, not defensive. Tauri derives
  ; UNINSTKEY as ...\Uninstall\${PRODUCTNAME}, and 1.0.9 renamed productName
  ; back to "Upscaly" -- so this key is now also *this* build's own key.
  ; Without the guard, every future update would find the key it just wrote,
  ; run a plain (non-/UPDATE) silent uninstall of the very install being
  ; upgraded, and take the ~290MB of downloaded ffmpeg with it. 0.1.0 is
  ; distinguishable only by its publisher, which was never "Wexpa".
  ReadRegStr $8 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly" "Publisher"
  ReadRegStr $0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly" "UninstallString"
  ${If} $0 != ""
  ${AndIf} $8 == "shayann07"
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
    ; Give Windows a moment to release the uninstaller image.
    Sleep 1200
    Delete /REBOOTOK "$0"
    RMDir /REBOOTOK "$1"
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly"
    DeleteRegKey SHCTX "Software\shayann07\Upscaly"
    Delete "$SMPROGRAMS\Upscaly.lnk"
  ${EndIf}

  ; 1.0.0-1.0.8 shipped as productName "Upscaly Studio". 1.0.9 renames back to
  ; "Upscaly" to match the Microsoft Store listing, which moves $INSTDIR, the
  ; uninstall key and the Start Menu shortcut again. Without this the 1.0.8
  ; install stays on disk, stays in Add/Remove Programs, and keeps offering
  ; this same update forever -- exactly what happened on the 0.1.0 -> 1.0.1
  ; bump, which stranded 297MB.
  ;
  ; Settings, history and model weights are keyed on the Tauri identifier
  ; (com.wexpa.upscaly), not on productName, so the rename does not touch them
  ; and they need no migration.
  ReadRegStr $4 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly Studio" "UninstallString"
  ReadRegStr $5 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly Studio" "InstallLocation"

  ; Strip the quotes the installer writes around InstallLocation. NSIS joins
  ; and compares paths literally, so a quoted value corrupts every path built
  ; from it.
  StrCpy $6 $5 1
  ${If} $6 == '"'
    StrLen $7 $5
    IntOp $7 $7 - 2
    StrCpy $5 $5 $7 1
  ${EndIf}

  ; Fall back to the filesystem when the registry says nothing.
  ;
  ; A 1.0.8 install can exist on disk with no uninstall key at all: the
  ; generated uninstaller skips MULTIUSER_UNINIT on installMode "currentUser",
  ; so a silent `uninstall.exe /S` left $INSTDIR empty, every
  ; `Delete "$INSTDIR\..."` resolved to a bare relative path and did nothing,
  ; while the registry cleanup -- which uses fixed key paths -- succeeded. The
  ; app deregistered itself and stayed on disk. That is the same fault
  ; NSIS_HOOK_PREUNINSTALL below exists to repair, and it was observed on a
  ; real machine: no key in any hive, but uninstall.exe, the Start Menu
  ; shortcut and 310MB still present.
  ;
  ; Keying the migration only on the registry would leave exactly those
  ; machines orphaned forever, which is the outcome this whole block exists to
  ; prevent. The default path is the only place a currentUser install can be.
  ${If} $4 == ""
    IfFileExists "$LOCALAPPDATA\Upscaly Studio\uninstall.exe" 0 no_orphan_install
      DetailPrint "Found a 1.0.8 install with no registry entry; migrating it anyway"
      StrCpy $5 "$LOCALAPPDATA\Upscaly Studio"
      StrCpy $4 "$5\uninstall.exe"
    no_orphan_install:
  ${EndIf}

  ${If} $4 != ""

    ; Rescue ffmpeg before the old install goes. It is ~290MB fetched from
    ; upstream, and the old uninstaller deletes it on a non-update run.
    ;
    ; It moves to the identifier-keyed directory rather than the new $INSTDIR
    ; because resolve_sidecar_path() probes there first, and that location is
    ; shared with the Microsoft Store build, which cannot write next to its own
    ; executable at all. Landing it there once means neither build ever has to
    ; download it again.
    StrCmp $5 "" skip_ffmpeg_rescue 0
    IfFileExists "$5\binaries\ffmpeg-x86_64-pc-windows-msvc.exe" 0 skip_ffmpeg_rescue
    IfFileExists "$LOCALAPPDATA\com.wexpa.upscaly\binaries\ffmpeg-x86_64-pc-windows-msvc.exe" skip_ffmpeg_rescue 0
      DetailPrint "Preserving downloaded video components"
      CreateDirectory "$LOCALAPPDATA\com.wexpa.upscaly\binaries"
      Rename "$5\binaries\ffmpeg-x86_64-pc-windows-msvc.exe" "$LOCALAPPDATA\com.wexpa.upscaly\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
      Rename "$5\binaries\ffprobe-x86_64-pc-windows-msvc.exe" "$LOCALAPPDATA\com.wexpa.upscaly\binaries\ffprobe-x86_64-pc-windows-msvc.exe"
    skip_ffmpeg_rescue:

    DetailPrint "Removing previous Upscaly Studio install"
    ExecWait '$4 /S _?=$5'
    ; Give Windows a moment to release the uninstaller image.
    Sleep 1200
    Delete /REBOOTOK "$4"
    RMDir /REBOOTOK "$5"
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Upscaly Studio"
    Delete "$SMPROGRAMS\Upscaly Studio.lnk"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Downloading video components (ffmpeg)..."

  ; Deliberately ignores the exit code. A failed fetch -- offline machine,
  ; captive portal, GitHub unreachable -- must not fail the installation:
  ; image upscaling never touches ffmpeg, and the app re-offers the
  ; download when a video job is actually started. Aborting here would
  ; leave a user with no app at all over an optional component.
  ; -InstallDir is the identifier-keyed directory, not $INSTDIR: it is what
  ; resolve_sidecar_path() probes first and what the Microsoft Store build
  ; reads, so one copy serves every install. The *script* still comes from
  ; $INSTDIR, where this installer just put it.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\provision-ffmpeg.ps1" -InstallDir "$LOCALAPPDATA\com.wexpa.upscaly"'
  Pop $0

  ${If} $0 == 0
    DetailPrint "Video components installed."
  ${Else}
    DetailPrint "Video components could not be downloaded; Upscaly will fetch them on first video job."
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
    ; The identifier-keyed directory, matching where POSTINSTALL now puts
    ; these and where the app looks first. $INSTDIR\binaries was the old
    ; location and nothing writes there any more, but a machine upgraded
    ; from <= 1.0.8 can still have a copy, so both are cleared.
    ;
    ; Caveat worth knowing: this directory is deliberately shared with the
    ; Microsoft Store build, which cannot write beside its own executable.
    ; Uninstalling this build while the Store build is also installed costs
    ; that one its ffmpeg, and it re-downloads on the next video job. That
    ; is self-healing; leaving 310MB stranded on every uninstall is not.
    Delete "$LOCALAPPDATA\com.wexpa.upscaly\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
    Delete "$LOCALAPPDATA\com.wexpa.upscaly\binaries\ffprobe-x86_64-pc-windows-msvc.exe"
    ; Non-recursive on purpose: this removes the directory only once it is
    ; empty, so anything a user put there themselves is never destroyed.
    RMDir "$LOCALAPPDATA\com.wexpa.upscaly\binaries"

    ${If} $INSTDIR != ""
      Delete "$INSTDIR\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
      Delete "$INSTDIR\binaries\ffprobe-x86_64-pc-windows-msvc.exe"
      RMDir "$INSTDIR\binaries"
    ${EndIf}
  ${EndIf}
!macroend

; Additions to the Windows installer that electron-builder makes. It reads
; build/installer.nsh by itself.

; Before installing over Shelfed, or removing it, the installer has to know
; whether Shelfed is still open. electron-builder's own check asks PowerShell
; and tasklist several times over, and on Windows 11, where Windows Terminal
; runs console programs, each one flashes a window. Shelfed open holds its own
; Shelfed.exe, so trying to open that file for writing answers the same
; question with no other program started.
!macro customCheckAppRunning
  Push $R0
  Push $R1
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $R1 0
    ${Do}
      ClearErrors
      FileOpen $R0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
      ${IfNot} ${Errors}
        FileClose $R0
        ${Break}
      ${EndIf}
      ; After an update, Shelfed is still closing itself, so it gets a few seconds first.
      IntOp $R1 $R1 + 1
      ${If} $R1 >= 20
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} is open. Close it, then choose Retry." /SD IDCANCEL IDRETRY +3
        ; Run silently, by Shelfed's own installer, it says why it stopped.
        SetErrorLevel 2
        Quit
        StrCpy $R1 0
      ${Else}
        Sleep 250
      ${EndIf}
    ${Loop}
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

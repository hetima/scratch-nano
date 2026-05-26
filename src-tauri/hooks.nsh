!macro NSIS_HOOK_PREINSTALL
  ${If} $InstallMode == "perUser"
    StrCpy $InstDir "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
  ${EndIf}
!macroend

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "Welcome to BunkMate Pro Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through installing BunkMate Pro — Offline Attendance Tracker & ESPRO Live Sync Engine for CHRIST University students.$\r$\n$\r$\nYou will be able to select your custom installation folder, shortcut preferences, and user scope."
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to keep your local BunkMate attendance database, exam records, and settings?\n\nClick 'Yes' to preserve your data for future reinstalls, or 'No' to completely delete all local app data." IDYES keepData IDNO removeData
  keepData:
    Goto doneUnInstall
  removeData:
    RMDir /r "$APPDATA\bunkmate-pro"
    RMDir /r "$LOCALAPPDATA\bunkmate-pro-updater"
  doneUnInstall:
!macroend

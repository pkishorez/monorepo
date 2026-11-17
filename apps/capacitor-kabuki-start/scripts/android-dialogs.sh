#!/usr/bin/env bash
# Usage: scripts/android-dialogs.sh
#
# Clears an "isn't responding" or crash dialog off the emulator before a
# screenshot, then prints the window that has focus. A slow emulator once put
# "Pixel Launcher isn't responding" over the app, which dimmed the bars in the
# photo. android.sh turns these dialogs off (hide_error_dialogs) before the app
# opens; this clears one that came up before that.
#
# A dialog's window is titled "Application Not Responding: <process>" or
# "Application Error: <process>"; stopping that process closes it. A dialog
# about the app itself stays up, so the check reports it.
set -uo pipefail

app=app.kishore.start

focus() {
  adb shell dumpsys window | grep -m1 mCurrentFocus | sed 's/.*mCurrentFocus=//' | tr -d '\r'
}

window=$(focus)
for _ in 1 2 3; do
  case $window in
    *"Application Not Responding: "* | *"Application Error: "*) ;;
    *) break ;;
  esac
  process=${window##*: }
  process=${process%\}}
  [ "${process%%:*}" = "$app" ] && break
  echo "Closing a system dialog: $window" >&2
  adb shell am force-stop "${process%%:*}" || true
  adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null || true
  sleep 2
  window=$(focus)
done
echo "$window"

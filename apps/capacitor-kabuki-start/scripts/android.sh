#!/usr/bin/env bash
# Usage: scripts/android.sh <apk> <out-dir>
#
# Installs the debug APK on the running emulator, opens it, reads the page's
# proof over CDP, then relaunches it with the network off. Leaves screenshots,
# logs and JSON in <out-dir> for verify.mjs; only a broken step fails it, never
# a finding.
set -euo pipefail

apk=$1
out=$(mkdir -p "$2" && cd "$2" && pwd)
app=app.kishore.start
here=$(cd "$(dirname "$0")" && pwd)

# Waits up to $1 seconds for the command after it to succeed.
wait_for() {
  local seconds=$1
  shift
  for _ in $(seq "$seconds"); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

# Opens the app and waits for its web view's DevTools socket. Every step
# returns on failure by hand: errexit is off inside `launch || ...`.
launch() {
  adb shell am force-stop "$app" || return 1
  adb shell am start -W -n "$app/.MainActivity" || return 1
  wait_for 30 adb shell pidof "$app" || return 1
  pid=$(adb shell pidof "$app" | tr -d '\r')
  echo "App pid $pid"
  wait_for 30 sh -c "adb shell cat /proc/net/unix | grep -q webview_devtools_remote_$pid"
}

# Takes a device screenshot, after clearing any system dialog off the screen.
screenshot() {
  "$here/android-dialogs.sh" >/dev/null || true
  adb exec-out screencap -p >"$out/$1" || true
}

# No "isn't responding" or crash dialogs: Android then stops the app that hung
# instead of asking. A slow emulator once covered the app with one.
adb shell settings put global hide_error_dialogs 1 || true
"$here/android-dialogs.sh" || true

adb install -r "$apk"
adb logcat -c
adb logcat -v time >"$out/logcat-all.txt" 2>&1 &
logcat=$!
trap 'kill $logcat 2>/dev/null || true' EXIT

if launch; then
  node "$here/android-proof.mjs" proof "$out" || echo "::warning::The CDP proof step failed; see the log."
else
  echo "::warning::The app or its web view's DevTools socket never came up."
fi
screenshot android.png
adb shell dumpsys vibrator_manager >"$out/vibrator.txt" 2>&1 || true

# The bars in both Themes, after the page's own proof run in each.
node "$here/android-proof.mjs" themes "$out" || echo "::warning::The themes step failed; see the log."

# The offline check needs a service worker in control; otherwise it would only
# show Android's error page.
sw=$(node -p "require('$out/android-proof.json').after['service-worker'] ?? 'unknown'" 2>/dev/null || echo unknown)
if [ "$sw" = controlling ]; then
  adb shell cmd connectivity airplane-mode enable || true
  adb shell svc wifi disable || true
  adb shell svc data disable || true
  sleep 3
  if launch; then
    sleep 5
    node "$here/android-proof.mjs" offline "$out" || echo "::warning::The offline CDP step failed; see the log."
  fi
  screenshot android-offline.png
  adb shell cmd connectivity airplane-mode disable || true
  adb shell svc wifi enable || true
  adb shell svc data enable || true
else
  printf '{"result":"skipped: service worker was %s"}\n' "$sw" >"$out/offline.json"
fi

kill $logcat 2>/dev/null || true
grep -E 'Capacitor|chromium|native-proof|native-shell' "$out/logcat-all.txt" >"$out/logcat.txt" || true

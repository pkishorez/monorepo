#!/usr/bin/env bash
# Usage: scripts/ios.sh <App.app> <out-dir>
#
# Boots an iPhone simulator with a Dynamic Island, installs the app and opens
# it once per Theme (theme=dark, then theme=light), each time with its output
# kept, waiting for the page's proof line and taking a screenshot. With
# LIVE_ACTIVITY=true it opens it once more with live=1, then puts it in the
# background and photographs the Dynamic Island, then locks the simulator and
# photographs the Lock Screen. Capacitor prints its own logs
# and the page's console with Swift's print, so they are on the app's stdout,
# not in the unified log. Leaves the files for verify.mjs.
#
# Each run points the installed app at its URL by editing the bundle's
# capacitor.config.json: the simulator does not check signatures, and one
# build serves every run.
set -euo pipefail

app_path=$1
out=$(mkdir -p "$2" && cd "$2" && pwd)
app=app.kishore.start
# The page may take up to a minute; loading it comes on top.
timeout=${PROOF_TIMEOUT:-90}

# The newest iOS runtime's iPhone Pro: every Pro since the 14 Pro has the
# Dynamic Island.
udid=$(xcrun simctl list devices available --json | node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const ios = Object.keys(devices).filter((runtime) => runtime.includes("iOS")).sort().reverse();
  for (const runtime of ios) {
    const phone = devices[runtime].find((device) => /^iPhone \d+ Pro$/.test(device.name));
    if (phone) { console.error(`${phone.name}, ${runtime}`); console.log(phone.udid); process.exit(0); }
  }
  process.exit(1);
')
echo "Simulator $udid"
xcrun simctl boot "$udid" || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app_path"
bundle=$(xcrun simctl get_app_container "$udid" "$app" app)

# Usage: run <output-file> <query to add, e.g. theme=light>
# Opens the app on SHELL_URL plus the query and waits for the proof line.
run() {
  local output=$out/$1 query=$2
  node -e '
    const fs = require("fs");
    const [file, base, query] = process.argv.slice(1);
    const url = new URL(base);
    for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value);
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.server.url = url.href;
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    console.log(`Opening ${url.href}`);
  ' "$bundle/capacitor.config.json" "$SHELL_URL" "$query"

  # --console-pty gives the app a terminal, so print is not held in a buffer.
  xcrun simctl launch --console-pty --terminate-running-process "$udid" "$app" \
    >"$output" 2>&1 &
  launcher=$!

  found=false
  for _ in $(seq "$timeout"); do
    if grep -q '\[native-proof\] ' "$output"; then
      found=true
      break
    fi
    sleep 1
  done
  # Let the native calls that follow the proof reach the output.
  sleep 3
  echo "Proof line in $1: $found"
}

stop() {
  xcrun simctl terminate "$udid" "$app" || true
  kill "$launcher" 2>/dev/null || true
}

# Usage: device_menu <item>, e.g. device_menu Lock
# simctl cannot lock the simulator; Simulator.app's Device menu can. The
# runner image lets osascript drive System Events (Accessibility), not
# Simulator itself, so the click goes through System Events.
device_menu() {
  osascript \
    -e 'on run argv' \
    -e 'tell application "System Events"' \
    -e 'tell process "Simulator"' \
    -e 'set frontmost to true' \
    -e 'click menu item (item 1 of argv) of menu 1 of menu bar item "Device" of menu bar 1' \
    -e 'end tell' \
    -e 'end tell' \
    -e 'end run' \
    "$1"
}

# Locks the simulator with the Live Activity running and photographs the
# Lock Screen. Never fails the job: the photo is evidence, not a check.
lock_screen() {
  open -a Simulator --args -CurrentDeviceUDID "$udid" || return 0
  for _ in $(seq 30); do
    windows=$(osascript -e 'tell application "System Events" to count windows of process "Simulator"' 2>&1 || true)
    echo "Simulator windows: $windows"
    [ "$windows" -gt 0 ] 2>/dev/null && break
    sleep 1
  done
  sleep 3
  osascript -e 'tell application "System Events" to tell process "Simulator" to get name of every menu item of menu 1 of menu bar item "Device" of menu bar 1' \
    >"$out/simulator-menu.txt" 2>&1 || true
  echo "Device menu: $(cat "$out/simulator-menu.txt")"
  # The first press locks: an iPhone Pro then shows the dimmed always-on
  # display. The second wakes it to the Lock Screen, as the side button does.
  device_menu Lock || echo "Lock failed"
  sleep 3
  xcrun simctl io "$udid" screenshot "$out/ios-locked.png" || true
  device_menu Lock || echo "Wake failed"
  sleep 3
  xcrun simctl io "$udid" screenshot "$out/ios-lock-screen.png" || true
}

run app-output.txt 'theme=dark'
xcrun simctl io "$udid" screenshot "$out/ios.png" || true
stop

run app-output-light.txt 'theme=light'
xcrun simctl io "$udid" screenshot "$out/ios-light.png" || true
stop

if [ "${LIVE_ACTIVITY:-}" = true ]; then
  run app-output-live.txt 'theme=dark&live=1'
  xcrun simctl io "$udid" screenshot "$out/ios-live.png" || true
  # Settings in front puts the app in the background; the activity moves to
  # the Dynamic Island.
  xcrun simctl launch "$udid" com.apple.Preferences || true
  # The island animates in; give it time to settle before the photo.
  sleep 8
  xcrun simctl io "$udid" screenshot "$out/ios-island.png" || true
  lock_screen
  stop
fi

xcrun simctl spawn "$udid" log show --last 10m --style compact \
  --predicate 'process == "App" OR process == "LiveActivityWidget" OR subsystem == "com.apple.activitykit"' \
  >"$out/unified.log" 2>&1 || true

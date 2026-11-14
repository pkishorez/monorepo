#!/usr/bin/env bash
# Usage: scripts/ios.sh <App.app> <out-dir>
#
# Boots an iPhone simulator, installs and opens the app with its output kept,
# waits for the page's proof line and takes a screenshot. Capacitor prints its
# own logs and the page's console with Swift's print, so they are on the app's
# stdout, not in the unified log. Leaves the files for verify.mjs.
set -euo pipefail

app_path=$1
out=$(mkdir -p "$2" && cd "$2" && pwd)
app=app.kishore.start
# The page may take up to a minute; loading it comes on top.
timeout=${PROOF_TIMEOUT:-90}

# The newest iOS runtime's first iPhone.
udid=$(xcrun simctl list devices available --json | node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const ios = Object.keys(devices).filter((runtime) => runtime.includes("iOS")).sort().reverse();
  for (const runtime of ios) {
    const phone = devices[runtime].find((device) => device.name.startsWith("iPhone"));
    if (phone) { console.log(phone.udid); process.exit(0); }
  }
  process.exit(1);
')
echo "Simulator $udid"
xcrun simctl boot "$udid" || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app_path"

# --console-pty gives the app a terminal, so print is not held in a buffer.
xcrun simctl launch --console-pty --terminate-running-process "$udid" "$app" \
  >"$out/app-output.txt" 2>&1 &
launcher=$!

found=false
for _ in $(seq "$timeout"); do
  if grep -q '\[native-proof\] ' "$out/app-output.txt"; then
    found=true
    break
  fi
  sleep 1
done
# Let the native Haptics calls that follow the proof reach the output.
sleep 3
echo "Proof line found: $found"

xcrun simctl io "$udid" screenshot "$out/ios.png" || true
xcrun simctl spawn "$udid" log show --last 5m --style compact \
  --predicate "process == \"App\"" >"$out/unified.log" 2>&1 || true

xcrun simctl terminate "$udid" "$app" || true
kill "$launcher" 2>/dev/null || true

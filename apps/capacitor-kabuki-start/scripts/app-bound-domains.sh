#!/usr/bin/env bash
# Usage: scripts/app-bound-domains.sh <host>   (macOS only)
#
# Makes <host> the app's one App-Bound Domain, which is what lets iOS give
# the remote site a service worker. Run it after
# `SHELL_APP_BOUND=true cap sync ios`, which turns on Capacitor's matching
# ios.limitsNavigationsToAppBoundDomains: with the key in Info.plist and that
# off, no plugin works (Capacitor says so beside that setting).
set -euo pipefail

host=$1
plist="$(cd "$(dirname "$0")/.." && pwd)/ios/App/App/Info.plist"

/usr/libexec/PlistBuddy -c 'Delete :WKAppBoundDomains' "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy \
  -c 'Add :WKAppBoundDomains array' \
  -c "Add :WKAppBoundDomains:0 string $host" \
  "$plist"
/usr/libexec/PlistBuddy -c 'Print :WKAppBoundDomains' "$plist"

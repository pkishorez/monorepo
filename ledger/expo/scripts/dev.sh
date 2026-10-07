#!/bin/sh
# Starts Metro on its port, stopping whatever already holds it first, so
# `pnpm dev` always leaves one fresh Metro running. Extra arguments go to
# `expo start` (e.g. `pnpm dev --ios`, `pnpm dev --tunnel`).
port="${METRO_PORT:-8081}"

pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN)
if [ -n "$pids" ]; then
  echo "Stopping what holds port $port ($pids)"
  kill $pids
  while lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null; do sleep 0.2; done
fi

EXPO_PUBLIC_COMMIT=$(git rev-parse --short HEAD) exec expo start --port "$port" "$@"

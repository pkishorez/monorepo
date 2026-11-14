#!/usr/bin/env bash
# Usage: affected.sh <app-dir> <workflow-file> <base> [path...]
# Writes affected=true|false to $GITHUB_OUTPUT. A change to a file starting
# with one of the extra paths counts too.
set -euo pipefail

app_dir=$1
workflow=$2
base=${3:-}
shift $(($# < 3 ? $# : 3))

affected() {
  echo "$1"
  echo "affected=$1" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
}

if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "Base '$base' unknown; deploying to be safe."
  affected true
fi

base=$(git merge-base "$base" HEAD)

forced=$(git diff --name-only "$base" HEAD | grep -xF \
  -e "$workflow" \
  -e .github/scripts/affected.sh \
  -e package.json \
  -e pnpm-lock.yaml \
  -e pnpm-workspace.yaml || true)
if [ -n "$forced" ]; then
  echo "Root files changed:"
  echo "$forced"
  affected true
fi

for path in "$@"; do
  changed=$(git diff --name-only "$base" HEAD | awk -v path="$path" 'index($0, path) == 1')
  if [ -n "$changed" ]; then
    echo "Changed under $path:"
    echo "$changed"
    affected true
  fi
done

if pnpm ls -r --depth -1 --parseable --filter "...[$base]" | grep -q "/$app_dir\$"; then
  affected true
fi
affected false

#!/usr/bin/env bash
# Usage: laymos-affected.sh <base>
set -euo pipefail

changed=$(git diff --name-only "$(git merge-base "$1" HEAD)" HEAD)
projects=$(git ls-files -- ':(glob)**/laymos.config.json' ':(exclude,glob)**/fixtures/**' | xargs -n1 dirname)

affected=false
for prefix in actions .github/workflows/pr-architecture.yml .github/scripts/laymos-affected.sh $projects; do
  if printf '%s\n' "$changed" | grep -q -e "^$prefix/" -e "^$prefix\$"; then
    echo "Changed: $prefix"
    affected=true
    break
  fi
done
echo "affected=$affected" >> "${GITHUB_OUTPUT:-/dev/null}"

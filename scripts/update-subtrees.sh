#!/usr/bin/env bash
set -euo pipefail

# Vendored read-only reference repos, added as squashed git subtrees.
# Add a new entry as "<prefix>|<remote-url>|<branch>" to register another repo.
SUBTREES=(
  "repos/effect-smol|https://github.com/Effect-TS/effect-smol.git|main"
)

# Vendored trees are read-only reference material — never lint/format them.
# Disable git hooks (vite-plus/husky) so the large squash commit isn't sent
# through `vp check`/`vp fmt`, which would choke on tens of thousands of files.
export VITE_GIT_HOOKS=0
export HUSKY=0

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit or stash changes before updating subtrees." >&2
  exit 1
fi

for entry in "${SUBTREES[@]}"; do
  IFS='|' read -r prefix url branch <<<"$entry"
  if [[ -d "$prefix" ]]; then
    echo "==> updating $prefix from $url ($branch)"
    git subtree pull --prefix="$prefix" "$url" "$branch" --squash
  else
    echo "==> adding $prefix from $url ($branch)"
    git subtree add --prefix="$prefix" "$url" "$branch" --squash
  fi
done

echo "done."

# One app inside the monorepo, organised by laymos layers

The Foundation, the Playground, and every explainer live in one app,
`apps/ai-explainer`, inside the monorepo that owns ui-toolkit. They are not
split into separate packages. Boundaries are enforced by laymos layers and
deep modules instead of package edges, and each explainer is its own deep
module. Being in the same workspace means ui-toolkit is consumed at source
with no second copy of React, and the app shares the monorepo's pinned
versions and lint. The rejected alternative was a separate `claude-experiments`
repo with the Foundation as its own package.

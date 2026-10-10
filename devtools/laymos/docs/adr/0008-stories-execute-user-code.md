# Stories execute user code inside laymos

Laymos analysis is purely static (ADR-0001): it never runs the project it
inspects. Stories deliberately break that rule — `laymos stories` and the
devtools `RunLaymosStories` RPC dynamically import each Story file and execute
its phases in-process to capture values, traces, and assertion outcomes;
browser Stories additionally drive a real Chromium through Playwright against a
Vite dev server rooted at the Project. We chose in-process execution over
keeping laymos static (stories are, by definition, executable verification) and
over a separate runner package (stories are a laymos pillar next to layers and
modules, share `laymos.config.json`, and a second package doubles the plumbing
for no v1 benefit). The static analysis pipeline stays execution-free; only the
story runner crosses the line. If crashy stories or conflicting globals ever
hurt, the escape hatch is a subprocess runner behind the same report contract.

Still valid after [ADR-0017](./0017-a-story-is-one-self-contained-claim.md),
which replaced the Story Group barrel with one file per Story, and
[ADR-0018](./0018-stories-are-a-tree-of-tellings.md), which calls those files
Proofs.

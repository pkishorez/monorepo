# Stories execute user code inside laymos

Laymos analysis is purely static (ADR-0001): it never runs the project it
inspects. Stories deliberately break that rule — `laymos stories` and the
devtools `RunStories` RPC dynamically import the Stories path barrel and
execute each Story's Effect program in-process to capture traces, flows, and
assertion outcomes. We chose in-process execution over keeping laymos static
(stories are, by definition, executable verification) and over a separate
runner package (stories are a laymos pillar next to layers and modules, share
`laymos.config.json`, and a second package doubles the plumbing for no v1
benefit). The static analysis pipeline stays execution-free; only the story
runner crosses the line. If crashy stories or conflicting globals ever hurt,
the escape hatch is a subprocess runner behind the same report contract.

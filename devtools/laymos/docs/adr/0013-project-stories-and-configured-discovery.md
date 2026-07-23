---
status: superseded by ADR-0014
---

# Author Project Stories and configure Story discovery

Executable Stories are discovered only beneath the recursive roots declared in
`laymos.config.ts`. Omitting `stories` means the project has no Story surface.
The configuration may also point to one optional Project Story inside a Story
root.

A Project Story is a default-exported, synchronous, serializable TypeScript
declaration. It is an ordered document of Markdown blocks and Project Maps.
Project Maps are trees of editorial responsibility topics; every topic has a
Markdown description and may reference zero or more executable Stories by
their project-relative Story IDs. Topic paths provide internal graph identity,
and sibling topic names must be unique.

Project Maps describe architecture, not runtime control flow. Their DSL and
artifact remain separate from executable Story flows and traces, while the
frontend reuses the same graph layout, node language, selection behavior, and
Markdown presentation. Story references appear in the selected topic's detail
card rather than as architectural tree nodes.

Story and Scenario metadata retain a required short `description` and gain an
optional rich `documentation` Markdown field. Documentation is rendered before
the generated structural narrative; the executable graph remains a separate
view. CommonMark and GitHub-flavored Markdown are supported, fenced code uses
Shiki, and raw HTML or executable components are not accepted.

An invalid Project Story is reported independently and does not block Story
discovery or execution. Documentation coverage is diagnostic. Story ejection
ignores the configured Project Story and its config.

Rejected: MDX, reusing executable `flow()` for documentation, deriving a
Project Story from the complete catalog, putting Story references in the
responsibility tree, and links from authored Markdown to runtime graph nodes.

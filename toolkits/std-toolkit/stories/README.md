# Glossary

- **Chapter** — one laymos `Story` on the spine (`spine: true`), numbered 01–35, in its own directory.
- **Act** — one top-level `Story.group`; five acts hold the chapters in reading order.
- **Appendix** — the sixth top-level group; its Stories are not spine and cover refused shapes, migration habits, and adapter-only features.
- **Proof** — the Effect under a `Story.question`; laymos renders its literal source as the question's snippet.
- **Setup** — every top-level statement in a story file outside `Story.make(...)`; laymos renders it as the chapter's setup block, so table/entity construction and imports-from-earlier-chapters belong there.
- **Recording** — the trace or flow section laymos captures when a proof is wrapped in `Story.trace` (Acts I–IV) or `Story.flow` (Act V).
- **Page** — the sibling markdown: `<chapter-slug>.story.md` for a chapter, `<group-title-slug>.md` in the shared folder for an act or appendix group (slug = lowercase, non-alphanumerics → `-`).
- **Spine** — the reading path. All 35 chapters are spine; nothing in the appendix is.

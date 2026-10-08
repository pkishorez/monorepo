# A Story is one self-contained claim in one file

Naming superseded by [ADR-0018](./0018-stories-are-a-tree-of-tellings.md):
the one-claim file described here is now a Proof, and a Story is a folder
with a Telling. The rules for a single claim still hold.

Stories began as question-based narratives: a Story held questions with prose
answers and proof Effects, Stories were assembled into Story Groups through an
`index.ts` barrel, every Story and Group had a markdown page, and a folder could
carry a `support.ts` of shared helpers. In practice the claim a Story made was
spread across five places — the question, its answer, the proof, the page, and
whatever the support file quietly arranged — and a green dot said the proof ran,
not that a reader could see why it held.

A Story is now one claim in one file: given a Preparation, when an Action is
performed, a Verification holds. The file default-exports one `Story.make` or
`Story.browser`; folders beneath the Stories path are Clusters and the only
organisation, so groups, pages, the barrel, ordering, and support files are
gone. The three phases are separate programs run in one scope, so a Preparation
that did not hold is reported as `unprepared` instead of letting a Verification
be read against a state that was never reached.

A Story file imports only what the Project ships, `effect`, and `laymos/story`.
No relative imports: a Preparation composes the Layers the package really
exports, never a mock or a helper beside the Story. `laymos lint` enforces it.
What a reader opens is everything that makes the claim true.

Every run keeps Evidence over a verdict: the value each phase returned, the
whole run's trace, and for the Browser Venue one raw Recording per Tab with each
Step on the Story clock. The verdict says it passed; the Evidence lets a reader
judge whether it should have.

The cost is real. Every existing Story had to be rewritten, and shared helpers
are lost: two Stories that need the same setup each spell it out. We accept the
repetition for confidence — a Story that cannot hide its setup cannot hide a
mock that makes it pass.

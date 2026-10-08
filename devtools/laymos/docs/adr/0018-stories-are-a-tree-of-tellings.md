# Stories are a tree of Tellings

[ADR-0017](./0017-a-story-is-one-self-contained-claim.md) made each claim one
self-contained file and called that file a Story, with folders as Clusters
and no other organisation. The claims held, but the tree said nothing: a
Reader opening a Project met a pile of claims grouped by folder name, with
no account of what the Project is for or how its parts fit.

A Story is now a folder beneath the Stories path, and its `story.md` is its
Telling: a title, a one-sentence pitch, and a short body that speaks to the
Reader and links each sub-Story where it explains why that part exists. The
one-claim files are Proofs (`*.proof.ts(x)`, `Proof.make`, `Proof.browser`),
unchanged in substance; the Proofs in a Story back it, end to end at the top
and one part's edge cases further down. Ids are the folder names from the top
Story, which is named after the Project, so a Telling links any Story or
Proof by id and a run is scoped by either.

The tree teaches the Project: read top down, it goes from the pitch to the
parts to the edges, each step proved. To keep it honest, a missing or
incomplete Telling, a link to nothing, and a sub-Story its parent never links
are Telling issues that `laymos lint` reports, and the order a Telling first
links its parts is the order they are shown.

The cost is prose to write and keep true for every folder, and a rename of
everything 0017 called a Story. This supersedes 0017's naming; its rules for
a single claim (one file, Self-contained, three phases, Evidence over a
verdict) now apply to Proofs.

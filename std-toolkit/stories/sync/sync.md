# Sync

Part three of three.

The table from part two lives on a server. The notebook lives in a browser tab —
often several at once, sometimes offline, sometimes reopened after a week away.
This part is about keeping all of them agreed on what the table holds.

Three ideas carry the whole part:

- A **collection** is the browser's copy of one entity, kept current by a worker
  reading the backend.
- A **live query** is what a screen mounts, and what updates when the copy does.
- A change made in the browser is shown **immediately** and confirmed afterwards.

Start with **How these stories run** for the vocabulary, then **Wiring a
collection** for the first note to make the round trip.

# Sync

This is part three of three.

The table from part two is on a server. The notebook is in a browser tab. There
are often several tabs. A tab can go offline. A tab can open again after a week.

This part keeps each of them in agreement about the table.

Three ideas carry the part.

- A **collection** is the copy of one entity that the browser holds. A worker
  reads the backend and keeps the copy current.
- A **live query** is what a screen mounts. It updates when the copy updates.
- A change made in the browser appears at once. The backend confirms it after.

Start with **Building the simulation**. Those Stories build the world that the
rest of the part runs in, and the last one proves that they built it. Then read
**Wiring a collection** for the first note that makes the complete trip.

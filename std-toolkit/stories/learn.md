# Learn

Three parts, in the order they depend on each other.

1. **Evolving Schema** — a Note gets a shape that can change without breaking
   the notes already written.
2. **Database** — that Note gets somewhere to live: one table shape that
   behaves identically on four different databases.
3. **Sync** — that table reaches the browser, and every open tab is kept
   agreed on it.

Reading them out of order is possible but harder: part two's table stores part
one's Note, and part three synchronises part two's table.

Each part opens by building the thing the rest of it uses, one piece per Story,
and closes that opening arc by _proving_ that what you built is what the later
Stories import.

---
'@kestack/connect': patch
---

New package: Connect, the program on a computer that serves Code, and Cloud Connect, which lists a User's Machines.

- `ke-connect serve` and `ke-connect logout` run and forget the Machine; its files live in XDG folders, moved once from `~/.ai-toolkit`.
- Doors: `machine`, `code` (what Code's browser imports, over the `ke-connect` subprotocol), `worker` (Cloud Connect) and `dev`.
- `dev` runs one Connect per branch, shared by every App's `pnpm dev`, and stops once the last App lets go.

---
'@kestack/kabuki': patch
'@kestack/web-platform': patch
---

A History can keep a Window: `History.make(actor, { window: 100 })`, `toReact(..., { window: 100 })`, or `history.keep(n)` at any time, even while the app runs. Entries older than the Window Compact into a Restore of the Snapshot right after them; `history.keep(null)` keeps every one again from then on. Saved Histories' ids now rise but may skip, and `history.has(id)` says whether an entry is still there. The Kabuki DevTools Timeline gets a Window field. `toReact` remembers a changed Window in `localStorage` under the app's name, so it outlasts a reload.

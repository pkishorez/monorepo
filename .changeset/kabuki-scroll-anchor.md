---
'@kestack/kabuki': patch
---

Lists can restore their own scroll position from an anchor, not just a pixel offset.

**New**

- `useKeepScrollAnchor({ id } | { getElement })`, from `routing/router`, saves an anchor (any JSON, such as the top item and its offset) with the current history entry.
- `useElementScrollRestoration` returns it as `anchor` on Back, Forward and reload. An element with an anchor is left for the list to restore once it has drawn.

**Fixed**

- A list that read its saved position before the router knew the history entry got nothing on page load. It now gets it once the entry is known.

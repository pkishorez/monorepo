---
'@kestack/kabuki': patch
---

A list that puts itself back now keeps an anchor, not just a pixel position.

- `useKeepScrollAnchor({ id } | { getElement })`, from `@kestack/kabuki/routing/router`, keeps an anchor under the history entry being shown. An anchor is where the list is in its own terms, such as the item at its top and its offset, and can be anything JSON holds.
- `useElementScrollRestoration` reads the anchor back as `anchor` on Back, Forward and a reload.
- Scroll restoration leaves an element that has an anchor alone: it doesn't put it back or send it to the top. The list puts itself back, once it has drawn what it needs.
- A user's scroll leaves the kept anchor as it is.
- Fixed: on a page load, a list that read its kept position before the router knew the history entry now gets it once the entry is known. Before, it got nothing, and a page that read early lost what the tab had saved for a reload.

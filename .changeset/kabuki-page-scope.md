---
'@kestack/kabuki': patch
---

`Page.build(page, { pages, scope })`: `scope`, worked out from the page's own data, says whose the pages under it are, as the account signed in. When it changes, every page under it starts again, with a fresh Model and Workers, though the URL stays.

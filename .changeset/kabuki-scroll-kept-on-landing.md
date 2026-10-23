---
'@kestack/kabuki': patch
---

`useElementScrollRestoration` reads what the entry a move lands on kept, in the very render that lands it. It read the entry before until scroll restoration had run for the move, so a page that puts itself back, as a list that follows its bottom does, found nothing kept on Back and Forward.

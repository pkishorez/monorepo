---
'@kestack/kabuki': patch
---

A stopped View keeps what it read of its Children.

**Changed**

- A View whose Instance has stopped, still drawn as it leaves the page, keeps what `useChild` and `useChildren` last read of its Children, as it keeps its own last data. A Child its live parent stopped still reads as gone. So a page can stay on screen, whole, until the next one is ready.

---
'@kestack/kabuki': patch
---

Views draw only what changed, as cheaply as before or cheaper, and a stopped View keeps what it read of its Children.

**Changed**

- A Router's move, a page's data and every other Router Message draw no `Router.Link` again: links read the Router's Sends alone, which never change, and `useRouter` reads one value that changes only with the entries, the move, the move held and the Metadata.
- Each View finds its Instance through one index of the Snapshot drawn, made once per Snapshot, instead of walking down from the root, so a Message costs every View a lookup, not a walk.
- A View whose Instance has stopped, still drawn as it leaves the page, keeps what `useChild` and `useChildren` last read of its Children, as it keeps its own last data. A Child its live parent stopped still reads as gone. So a page can stay on screen, whole, until the next one is ready.

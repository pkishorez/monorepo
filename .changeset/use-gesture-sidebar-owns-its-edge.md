---
'@kstackz/use-gesture': minor
---

An enabled Sidebar keeps its side's screen edge from the browser's edge swipe whether it is open or closed, so a swipe from that edge never goes back a page. `useGesture` gains a `guardsEdge: 'left' | 'right'` option that guards an edge without taking any Gesture. See ADR 0014.

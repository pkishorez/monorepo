---
'@kstackz/use-gesture': patch
---

Adds two layers above `useGesture`. `useSwipe` is the Swipe Recognizer: fingers moving one way, with filters on direction, finger count and starting edge, live `offset`, `velocity` and `willCommit`, and a Commit or Cancel as the first finger lifts; a flick is `commit: { velocity }`. `useSidebar` and `usePullToRefresh` are Patterns built on it that return motion values and settle themselves.

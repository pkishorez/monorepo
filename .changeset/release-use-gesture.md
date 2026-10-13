---
'@kstackz/use-gesture': patch
---

Breaking: the package is now a platform-free core, with no DOM, React or Motion, and no peer dependencies. `createGestureProvider` takes plain finger samples from any touch source; it also exports the `Swipe` rules, `TreeWalk` and the new `thumbLock`. The React bindings (`GestureProvider`, `GestureZone`, `useGesture`, `useSwipe`, `useSidebar`, `usePullToRefresh`) move to `@kstackz/web-platform/input`, and `./core` and `./recognizers` are gone.

---
'@kstackz/use-gesture': patch
'@kstackz/ui-toolkit': patch
---

use-gesture splits into a platform-free core and `./web`. The package root is now the core, with no DOM, React or Motion: `createGestureProvider`, which any touch source feeds plain finger samples (`{ id, x, y, t, target }`) and a Zone Tree saying how its zones nest; `directionOf`, `wants` and `SLOP`; the `Swipe` rules; and `TreeWalk`, the walk through a tree of choices a picker such as Ledger's Thumb Picker moves through. The browser's touch source and the React bindings move to `@kstackz/use-gesture/web`: `GestureProvider`, `GestureZone`, `useGesture`, `useSwipe`, `useSidebar` and `usePullToRefresh`, which behave as before. The `./core` and `./recognizers` entry points are gone; import from `./web`. `motion`, `react` and `react-dom` are now optional peers. ui-toolkit's app shell imports from `./web`.

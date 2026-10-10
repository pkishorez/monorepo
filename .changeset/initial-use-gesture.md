---
'@kstackz/use-gesture': patch
'@kstackz/web-platform': patch
---

Introducing `@kstackz/use-gesture`: touch gestures for React, with every finger of a touch as motion values, in nested zones that own touch.

- `@kstackz/use-gesture`: `GestureProvider`, `GestureZone`, and the ready-made `useSidebar` and `usePullToRefresh`.
- `@kstackz/use-gesture/recognizers`: `useSwipe`, fingers moving one way, with live offset, velocity and whether a release would commit.
- `@kstackz/use-gesture/core`: `useGesture`, every finger of each touch and nothing else.

The gestures block moves here from `@kstackz/ui-toolkit`; `@kstackz/ui-toolkit/components/blocks/gestures` is gone.

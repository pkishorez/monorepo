# @kstackz/use-gesture

## 0.0.12

### Patch Changes

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`1dd5049`](https://github.com/pkishorez/monorepo/commit/1dd5049705d9f722a6fc2486240a2e7cd11bbbe3) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Introducing `@kstackz/use-gesture`: touch gestures for React, with every finger of a touch as motion values, in nested zones that own touch.

  - `@kstackz/use-gesture`: `GestureProvider`, `GestureZone`, and the ready-made `useSidebar` and `usePullToRefresh`.
  - `@kstackz/use-gesture/recognizers`: `useSwipe`, fingers moving one way, with live offset, velocity and whether a release would commit.
  - `@kstackz/use-gesture/core`: `useGesture`, every finger of each touch and nothing else.

  The gestures block moves here from `@kstackz/ui-toolkit`; `@kstackz/ui-toolkit/components/blocks/gestures` is gone.

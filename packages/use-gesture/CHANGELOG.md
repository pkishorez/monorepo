# @kstackz/use-gesture

## 0.0.12

### Patch Changes

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`1dd5049`](https://github.com/pkishorez/monorepo/commit/1dd5049705d9f722a6fc2486240a2e7cd11bbbe3) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Introducing `@kstackz/use-gesture`: touch gestures for React, with every finger of a touch as motion values, in nested zones that own touch.

  - `@kstackz/use-gesture`: `GestureProvider`, `GestureZone`, and the ready-made `useSidebar` and `usePullToRefresh`.
  - `@kstackz/use-gesture/recognizers`: `useSwipe`, fingers moving one way, with live offset, velocity and whether a release would commit.
  - `@kstackz/use-gesture/core`: `useGesture`, every finger of each touch and nothing else.

  The gestures block moves here from `@kstackz/ui-toolkit`; `@kstackz/ui-toolkit/components/blocks/gestures` is gone.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`ae93dd8`](https://github.com/pkishorez/monorepo/commit/ae93dd8a49e01c4c01e8033736220e704435a2c9) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A one-finger swipe from a Sidebar's edge strip always moves the Sidebar, even over a zone inside that wants the same Direction, such as swipeable tabs. The strip is 24px, or `edge` when set. A touch of more fingers there is still left to the zones. See ADR 0015.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`a9a0c20`](https://github.com/pkishorez/monorepo/commit/a9a0c20eb05422db2557e2d2012f13f5051dad5c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - An enabled Sidebar keeps its side's screen edge from the browser's edge swipe whether it is open or closed, so a swipe from that edge never goes back a page. `useGesture` gains a `guardsEdge: 'left' | 'right'` option that guards an edge without taking any Gesture. See ADR 0014.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`23ad244`](https://github.com/pkishorez/monorepo/commit/23ad244481b2b3d0f1e8afb552143996ae54a217) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Gesture no longer outlives its fingers. A finger's lift is heard on the element it landed on too, so it ends the Gesture even after that element has left the page, as iOS sends it there. And a touch that finds fewer fingers on the screen than the Gesture under way has ends that Gesture as Interrupted, rather than joining it.

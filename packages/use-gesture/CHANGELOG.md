# @kestack/use-gesture

## 0.0.2

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Touch Source's `sink.pick(direction)` names the zone that would take the Gesture, `{ zone, how }`.

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: the package is now a platform-free core, with no DOM, React or Motion, and no peer dependencies. `createGestureProvider` takes plain finger samples from any touch source; it also exports the `Swipe` rules, `TreeWalk` and the new `thumbLock`. The React bindings (`GestureProvider`, `GestureZone`, `useGesture`, `useSwipe`, `useSidebar`, `usePullToRefresh`) move to `@kestack/web-platform/input`, and `./core` and `./recognizers` are gone.

# @kestack/use-gesture

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: the package is now a platform-free core, with no DOM, React or Motion, and no peer dependencies. `createGestureProvider` takes plain finger samples from any touch source; it also exports the `Swipe` rules, `TreeWalk` and the new `thumbLock`. The React bindings (`GestureProvider`, `GestureZone`, `useGesture`, `useSwipe`, `useSidebar`, `usePullToRefresh`) move to `@kestack/web-platform/input`, and `./core` and `./recognizers` are gone.

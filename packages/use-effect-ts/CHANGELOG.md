# use-effect-ts

## 0.0.11

### Patch Changes

- [#37](https://github.com/pkishorez/monorepo/pull/37) [`c0dc89f`](https://github.com/pkishorez/monorepo/commit/c0dc89f3899267d87b239694d63cbbda880cb646) Thanks [@pkishorez](https://github.com/pkishorez)! - Add the `use-effect-ts/query` subpath with `useEffectQuery(key, effect, options)` for cached Effect-backed reads using TanStack Query. Pass query options through, propagate cancellation to Effect execution, and expose `effectQueryOptions`, `QueryClient`, `QueryClientProvider`, and `useQueryClient` for shared cache management.

- [#38](https://github.com/pkishorez/monorepo/pull/38) [`d7a9f63`](https://github.com/pkishorez/monorepo/commit/d7a9f63b89b3ad7b047fed220cc3d9e96dae1686) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Fix `useRunEffect` and `useRunEffectLatest` throwing when called during mount.

  Before, the runner returned on the first render had no scope behind it. Calling it from a `useEffect` on mount, or from anything else that ran before the second render, threw `useRunEffect: No scope available, effect will not run`. The message pointed at `useComponentLifecycle`, which could not help because it runs in the same commit and sees the same stale runner. The usual workaround was an extra `mounted` state plus a second effect to delay the first call by one render.

  ```tsx
  const run = useRunEffect(() => loadPlan());
  useEffect(() => {
    run(); // threw on mount
  }, []);
  ```

  After, the component's scope is created lazily on first use, so the code above just works. The runner is also referentially stable, so it can sit in a dependency array without re-firing effects, and it always calls the latest `fn` you passed. The scope still closes on unmount, interrupting any fibers it owns, and is recreated if React remounts the component under StrictMode.

## 0.0.10

### Patch Changes

- [`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin the `effect` peer dependency (and other registry peers) to exact versions. The previous `^4.0.0-beta.102` range also matched `4.0.0-rc.*` prereleases, so fresh installs (e.g. `npx laymos`) resolved an incompatible `effect` build and crashed with `ERR_MODULE_NOT_FOUND`.

## 0.0.9

### Patch Changes

- [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4) Thanks [@pkishorez](https://github.com/pkishorez)! - Widen the peer ranges to `effect@^4.0.0-beta.102` and `react@^19.2.7`. `effect`
  was pinned to the exact `4.0.0-beta.78`, which forced a duplicate install for
  anyone already on a later beta. No runtime code changed.

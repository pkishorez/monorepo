---
'use-effect-ts': patch
---

Fix `useRunEffect` and `useRunEffectLatest` throwing when called during mount.

Before, the runner returned on the first render had no scope behind it. Calling it from a `useEffect` on mount, or from anything else that ran before the second render, threw `useRunEffect: No scope available, effect will not run`. The message pointed at `useComponentLifecycle`, which could not help because it runs in the same commit and sees the same stale runner. The usual workaround was an extra `mounted` state plus a second effect to delay the first call by one render.

```tsx
const run = useRunEffect(() => loadPlan());
useEffect(() => {
  run(); // threw on mount
}, []);
```

After, the component's scope is created lazily on first use, so the code above just works. The runner is also referentially stable, so it can sit in a dependency array without re-firing effects, and it always calls the latest `fn` you passed. The scope still closes on unmount, interrupting any fibers it owns, and is recreated if React remounts the component under StrictMode.

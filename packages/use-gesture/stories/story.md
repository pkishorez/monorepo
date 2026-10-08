# use-gesture

Feed in fingers from any touch source and get the same swipes and thumb menus on every platform.

Touch rules are easy to get subtly different on each platform: how far a finger moves before it counts, which way it went, whether a release was a swipe or a nudge. This package holds those rules once, with no DOM, no React and no animation library, so a browser and a phone agree.

You hand `createGestureProvider` plain finger samples from wherever your touches come from:

```ts
provider.sink.down({ id, x, y, t, target });
```

The provider follows every finger, tells you which way a touch is going, and the Swipe rules decide on release whether it went far or fast enough. [Your own pointer events become a swipe](use-gesture/a-swipe-from-your-own-touch-source) that cancels when it is a nudge and commits when it is not.

The same fingers can drive a menu, too: a [resting thumb and a moving finger](use-gesture/thumb-picker) walk through a tree of choices.

This package is the core only. If you build for the browser, web-platform's input gives you the zones, hooks and ready-made patterns built on it, with stories of their own.

# Every key

Hear every key as it goes down and comes up, for modes like holding Space to pan.

Some keys are not commands. Holding Space turns the pointer into a hand; letting go turns it back. `useKeys` tells you about each key the page hears, from the first going down until the last comes up, without taking any of them from your Shortcuts.

```tsx
const { keysRef, active } = useKeys({ onKey, onEnd });
```

It does not re-render on every key: you read the keys held in your callbacks, and `useKeysState` shows them live when you want them on screen. [Holding Space pans the board](use-keys/every-key/hold-space-to-pan), and once the last key lifts you get every key that was held.

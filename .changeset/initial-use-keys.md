---
'@kstackz/use-keys': patch
---

Introducing `@kstackz/use-keys`: keyboard shortcuts for React, the keyboard counterpart of `@kstackz/use-gesture`.

- `@kstackz/use-keys`: `KeysProvider`, which hears every key on the page and leaves text fields their typing, `useKeys`, every key from the first going down to the last lifting in a ref that never re-renders, and `useKeysState` to render them.
- `@kstackz/use-keys/recognizers`: `useShortcut`, one key with exact modifiers, and `useSequence`, Shortcuts in order such as `g g`. Two Enabled ones whose keys conflict throw in development.

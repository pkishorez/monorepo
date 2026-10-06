# @kstackz/use-keys

## 0.0.12

### Patch Changes

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`eaa92b2`](https://github.com/pkishorez/monorepo/commit/eaa92b2183e8766c9faaa3928c58502611340506) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Introducing `@kstackz/use-keys`: keyboard shortcuts for React, the keyboard counterpart of `@kstackz/use-gesture`.

  - `@kstackz/use-keys`: `KeysProvider`, which hears every key on the page and leaves text fields their typing, `useKeys`, every key from the first going down to the last lifting in a ref that never re-renders, and `useKeysState` to render them.
  - `@kstackz/use-keys/recognizers`: `useShortcut`, one key with exact modifiers, and `useSequence`, Shortcuts in order such as `g g`. Two Enabled ones whose keys conflict throw in development.

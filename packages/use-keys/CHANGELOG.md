# @kestack/use-keys

## 0.0.2

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - - Breaking: `createKeys` is one typed Keys tree of Surfaces and Actions, drawn with `keys.Surface`.
  - Focus Spots remember focus per Surface; `keys.Provider` takes `autoFocus`.
  - `keys.useKeysOf`, `shortcutOf` and `bindingOf` for showing and recording keys.

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - First release. Keyboard shortcuts for React. `KeysProvider` hears every key on the page and leaves text fields their typing; `useShortcut` and `useSequence` act on keys like `mod+k` or `g g`; `createKeys` names an app's Surfaces and Actions in one place, with the user's own Bindings replacing the defaults.

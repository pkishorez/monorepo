# @kestack/use-keys

## 0.0.3

### Patch Changes

- [#135](https://github.com/pkishorez/monorepo/pull/135) [`803e7a0`](https://github.com/pkishorez/monorepo/commit/803e7a0425c11465e59eaca169a335824cd7b318) Thanks [@pkishorez](https://github.com/pkishorez)! - A component draws again only when what it reads of the keyboard changes.

  **Added**

  - `keys.useMoves()`: `enter` and `leave` alone, the same functions on every draw, never drawn again as the user moves.
  - `keys.useVim()`: Vim Mode alone, drawn again only as it turns on or off.
  - `keys.useSurface(name, { enabled: false })` reads the Surface as Off and draws nothing again, for one of many popups sharing a Surface while it is closed.

  **Changed**

  - `useAvailableActions` gives the same list, and each Action the same `run`, while what works stays the same, so a Handler added or removed for an Action already working draws no help sheet or palette again.
  - A Handler mounting tells the store once, not twice.
  - Each Binding's words are worked out once, as the store describes every Binding whenever what works changes.

## 0.0.2

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - - Breaking: `createKeys` is one typed Keys tree of Surfaces and Actions, drawn with `keys.Surface`.
  - Focus Spots remember focus per Surface; `keys.Provider` takes `autoFocus`.
  - `keys.useKeysOf`, `shortcutOf` and `bindingOf` for showing and recording keys.

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - First release. Keyboard shortcuts for React. `KeysProvider` hears every key on the page and leaves text fields their typing; `useShortcut` and `useSequence` act on keys like `mod+k` or `g g`; `createKeys` names an app's Surfaces and Actions in one place, with the user's own Bindings replacing the defaults.

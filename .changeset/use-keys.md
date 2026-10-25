---
'@kestack/use-keys': patch
---

- Breaking: `createKeys` is one typed Keys tree of Surfaces and Actions, drawn with `keys.Surface`.
- Focus Spots remember focus per Surface; `keys.Provider` takes `autoFocus`.
- `keys.useKeysOf`, `shortcutOf` and `bindingOf` for showing and recording keys.

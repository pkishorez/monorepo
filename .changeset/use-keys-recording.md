---
'@kestack/use-keys': patch
---

Recording keys for a settings screen. `shortcutOf(event)` gives the Shortcut one key going down presses, named exactly as keys are matched, so the same key presses it again: Ctrl stays `ctrl`, Cmd on Apple platforms is `mod`, a digit or symbol is the character typed, and a modifier alone or a key no Shortcut names gives null. `bindingOf(text)` reads keys written at runtime, such as a user's stored Bindings, as a Shortcut or a Sequence, and throws on anything else.

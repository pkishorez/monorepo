# Showing the keys

Show people which keys work right now, and what they can press next.

Shortcuts nobody knows about don't get used. `keys.useAvailableActions` lists every Action that works where the user is, nearest Surface first, with its id, its label, its keys and whether a nearer Action Shadows it; `describe` writes the keys for people.

That is enough for [a help sheet that lists what works](use-keys/whole-keyboard/showing-the-keys/a-help-sheet-lists-what-works). While a Sequence is under way, `keys.useKeyboard().pending` says which keys were pressed, so you can show [every way to finish it](use-keys/whole-keyboard/showing-the-keys/a-hint-after-the-first-key) after the first key.

Each listed Action has a `run`, so [a command palette runs an Action by name](use-keys/whole-keyboard/showing-the-keys/a-command-palette-runs-actions), exactly as its keys would.

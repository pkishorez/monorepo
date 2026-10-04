# Listeners act after the page, unless an element is Taken Over

The browser sends a key down from the window to the focused element, then back up. use-keys listens on the way back up by default, so the page acts first: Text Entry types its key, and a component that handles a key, such as a menu's arrows, keeps it, and no listener Takes it. On an element marked Taken Over, use-keys listens on the way down instead, so a Recognizer can Take a key before the element sees it, such as a combobox's arrows and Enter; keys nobody Takes still reach the element. On an element marked Left Alone, no listener hears its keys at all.

## Considered Options

- **Always act first and have each listener exclude Text Entry**: rejected. Every existing component would have to know the package exists, and a forgotten check eats a user's typing.
- **Always act last**: rejected. A field that should hand its arrows to a list could never give them up.

## Consequences

- Keys typed while composing text in another script, keys the browser keeps such as closing a tab, and keys inside an iframe never reach listeners.
- In Text Entry, a Shortcut with Ctrl, Alt or Cmd may still Take its key when it asks to; plain keys never.
- Escape in Text Entry leaves it, unless a component already used that Escape; that Escape reaches no Shortcut.

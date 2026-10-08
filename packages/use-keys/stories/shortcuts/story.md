# Shortcuts

Run your code when one key is pressed, with exactly the modifiers you wrote and the same keys on every platform.

You write a key the way you would say it: `j`, `shift+g`, `mod+k`. `useShortcut` runs your function when that key goes down, and only then: `s` does not fire on Ctrl+S.

```tsx
useShortcut([shortcut('j'), shortcut('ArrowDown')], () => move(1));
```

A list means "any of these", so [j and the down arrow can do the same thing](use-keys/shortcuts/j-and-k-move-through-a-list). [Modifiers must match exactly](use-keys/shortcuts/modifiers-must-match-exactly), and [mod means ⌘ on a Mac](use-keys/shortcuts/mod-means-cmd-on-a-mac) and Ctrl elsewhere, so one Shortcut fits everyone.

Holding a key down [repeats only when you ask](use-keys/shortcuts/holding-a-key-repeats-when-asked), so `j` can scroll a long list while "favourite" fires once. When the whole screen should go quiet, [pausing the provider turns every Shortcut off](use-keys/shortcuts/pausing-turns-every-shortcut-off) at once.

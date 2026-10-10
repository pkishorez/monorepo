# Conflicts

Two parts of your app never silently fight over one key: in development the second one throws.

If two Shortcuts both want `j`, one of them will lose, and you would only find out when someone presses it. So two Shortcuts or Sequences that are on at the same time and want the same keys throw while you develop. Even `g` and `g g` conflict, because the first `g` could mean either; [the newer one throws and the first keeps its key](use-keys/conflicts/an-overlapping-sequence-throws).

When two places really should share a key, turn on only the one that is in use:

```tsx
useShortcut('j', next, { enabled: pane === 'left' });
```

That way [two panes share j, and only the one turned on moves](use-keys/conflicts/two-panes-share-one-key).

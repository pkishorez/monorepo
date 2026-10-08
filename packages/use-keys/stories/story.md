# use-keys

Give your React app keyboard shortcuts that never steal a key from someone typing and never fight each other.

You want `j` to move down a list and `g g` to jump to the top. Done by hand, you find out the hard way that `j` fires while someone types a name, or that two parts of the screen both grab Escape.

You put one provider at the root and declare each key next to the code it runs:

```tsx
useShortcut('j', () => move(1));
useSequence('g g', () => toTop());
```

Start with [Shortcuts](use-keys/shortcuts): one key, with or without modifiers. [Sequences](use-keys/sequences) add keys pressed one after another, like `g g`. Neither gets in the way of [text fields](use-keys/text-fields): a field keeps the keys you type, and Escape steps out of it. When you need more than a Shortcut, you can hear [every key](use-keys/every-key) as it goes down and up. Two Shortcuts that want the same key are a [conflict](use-keys/conflicts) you hear about in development, not a bug your users find.

As the app grows, you write [its whole keyboard](use-keys/whole-keyboard) in one place: where each key works, what it is called, and which keys your users picked.

Here it all is on one page: [a list you drive from the keyboard](use-keys/a-list-you-drive-from-the-keyboard).

# Whole keyboard

Build your app's keyboard out of Surfaces: the parts of the screen the user works in, each with its own keys.

Past a dozen Shortcuts, scattered hooks get hard to follow: which `j` is this, does Escape close the dialog or the page, what do you show in a help sheet? `createKeys` is the map: one definition names every Surface, how they nest, and the Actions on each, with their keys and labels. `keys.Surface` puts the map on screen, `keys.useAction` says what an Action does, and `appearance` says how each Surface looks.

```tsx
const keys = createKeys({
  inbox: { actions: { next: { keys: 'j', label: 'Next thread' } } },
});

<keys.Surface id="inbox">
  <Threads />
</keys.Surface>;

// Inside Threads:
keys.useAction('inbox.next', () => move(1));
```

One [Surface is Active](use-keys/whole-keyboard/surfaces) at a time, and a key does what it says there. The keys state drives the UI, never the other way round: a panel is drawn while its Surface is Active. Because each Action carries a label, you get [a help sheet, hints and a command palette](use-keys/whole-keyboard/showing-the-keys) almost for free.

Actions are Vim keys: plain letters like `j` that would surprise someone who never asked for them. They work only with Vim Mode on, which `keys.Provider` keeps for you, off at first, or takes as its `vim` prop. Mark an Action `always`, as you would `mod+k`, and [it works with Vim Mode off too](use-keys/whole-keyboard/vim-off-keeps-always-actions); `useKeyboard().vim` turns Vim Mode on and off.

The provider's `bindings` take the user's own keys by Action id, so [a key the user picks replaces the defaults at once](use-keys/whole-keyboard/users-pick-their-own-keys).

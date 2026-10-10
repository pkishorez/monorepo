# Whole keyboard

Write every key your app has in one place, and let where the user is decide what each key does.

Past a dozen Shortcuts, scattered hooks get hard to follow: which `j` is this, does Escape close the dialog or the page, what do you show in a help sheet? With `createKeys` you name each Action, its description and its default keys once, grouped by the parts of the screen they belong to.

```tsx
const keys = createKeys({
  surfaces: {
    inbox: {
      actions: { next: { keys: [shortcut('j')], description: 'Next thread' } },
    },
  },
});
keys.useAction('inbox.next', () => move(1));
```

Those parts are [Surfaces](use-keys/whole-keyboard/surfaces): you say which one is active, and the same key can mean something different in each. Because every key is written down, you get [a help sheet, hints and a command palette](use-keys/whole-keyboard/showing-the-keys) almost for free.

And since you hand the provider the user's own choices, [a key the user picks replaces the defaults at once](use-keys/whole-keyboard/users-pick-their-own-keys).

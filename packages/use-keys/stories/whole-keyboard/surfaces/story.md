# Surfaces

Each part of the screen is a Surface, and a key does what the Active one says.

An inbox, the reply box inside it and a delete dialog all want their own keys. The definition is the keys tree: a Surface written inside another is its child. One Surface is Active, the `initial` one at first, and a click or focus inside a Surface's element enters it.

[The same key does what the Active Surface says](use-keys/whole-keyboard/surfaces/the-active-surface-decides) and nothing in the Surfaces beside it. A key climbs from the Active Surface out through its Parents, and [the nearest Action wins](use-keys/whole-keyboard/surfaces/the-nearest-action-wins): `e` in the draft edits it instead of archiving the thread.

The keys tree is the only hierarchy. A Surface's element can be drawn anywhere on the page, so [a composer drawn beside the session is still inside it](use-keys/whole-keyboard/surfaces/the-keys-tree-decides-not-the-page) when the definition says so.

An Action with `enters` makes a Surface Active, drawn or not. A dialog marked `isolated` is drawn while its Surface is Active and [cuts off everything behind it](use-keys/whole-keyboard/surfaces/a-dialog-cuts-off-the-page-behind), its Parents included: no key climbs out of it. When it is left, [it goes back to where it was opened from](use-keys/whole-keyboard/surfaces/closing-goes-back), without knowing who opened it.

Escape goes in order. A component that used it keeps it. With Vim Mode on, typing in a field, it leaves the field. Then the Active Surface's own Escape Action runs, if it has an Enabled one; its Parents' never do. Otherwise Escape leaves the Surface: `onExit` runs and the Parent, or for an Isolated one the Surface it came from, becomes Active. So [Escape in a picker clears the search, then closes the picker](use-keys/whole-keyboard/surfaces/escape-clears-then-closes-a-picker). With Vim Mode off, Escape leaves only Isolated Surfaces.

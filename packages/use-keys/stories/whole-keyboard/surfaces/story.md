# Surfaces

Tell the keyboard where the user is, and each key does what that part of the screen says.

An inbox, the reply box inside it and a delete dialog all want Escape, and each means something different. You keep the active Surface in your own state and hand it to the provider; the keys follow.

[The same key does what the active Surface says](use-keys/whole-keyboard/surfaces/the-active-surface-decides) and nothing anywhere else. Surfaces nest, and [the nearest Action wins](use-keys/whole-keyboard/surfaces/the-nearest-action-wins): Escape in the reply box discards the draft instead of closing the inbox.

A dialog marked `isolated` [cuts off the page behind it](use-keys/whole-keyboard/surfaces/a-dialog-cuts-off-the-page-behind) but keeps the app-wide keys, and a Surface with `globals: false` [silences the app-wide keys too](use-keys/whole-keyboard/surfaces/presenting-silences-app-wide-keys), as a slideshow should.

A palette or dialog can open itself and, when it closes, [go back to where it was opened from](use-keys/whole-keyboard/surfaces/closing-goes-back), without knowing who opened it.

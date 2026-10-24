---
'code': patch
---

Whether the device has a keyboard, not the screen's width, decides how the app behaves. With no keyboard, Vim Mode and its status line are off however wide the screen, and nothing takes focus on its own: a Picker's search waits to be tapped, so the on-screen keyboard rises only when asked. A Picker's `Frame` can opt in with `focusOnTouch`: the tap that opens it raises the on-screen keyboard, as iOS needs, for its Dialog's search to take once on screen. With a keyboard, everything focuses as before.

---
'@kestack/web-platform': patch
---

Every touch Drawer, not only a tall one, now sits above the on-screen keyboard in the part of the page left visible, and with a field in it focused takes all of that but the status bar, so on iOS nothing in it is hidden under the keyboard.

While the keyboard is up, a Drawer keeps no room at its foot for the home indicator the keyboard covers, so it sits right on the keyboard; `--visible-safe-bottom` gives that room to what is inside it.

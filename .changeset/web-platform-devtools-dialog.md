---
'@kestack/web-platform': patch
---

**Added**

- `DevtoolsDialog`, from `@kestack/web-platform/recipes/devtools`: devtools opened full screen over a page they never wrap or lay out, for a page the Devtools Dock cannot place beside them, such as one fixed to the screen. Drawn beside the page, it opens from the Dock's corner button and Ctrl+/ or ⌘/ (unless `shortcut` is off), closes with Escape unless something inside took it first, keeps whether it was open across reloads, and stays closed with no button on a phone with `onPhones` off.

---
'@kestack/web-platform': patch
---

No focus ring or lit border while the input last used is a touch: `DEVICE_SCRIPT` keeps `data-input` on `<html>` (`touch`, a pen too, `mouse` or `keys`), and the `focus-visible:` and `focus-within:` variants, the `focus-ring` utility and the input group's ring draw nothing under `data-input="touch"`. Keys and a mouse still see them. `PopoverContent` takes `backdrop`, which dims the rest of the screen behind it; a click there closes it.

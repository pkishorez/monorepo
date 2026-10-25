---
'@kestack/web-platform': patch
---

In a field, a chord with Cmd, Ctrl or Alt, or a named key such as Escape, Tab or an arrow, now marks the input last used as the keys (`data-input="keys"`), so focus rings come back for a hardware keyboard. A character, Backspace or Enter typed there still leaves it as it was, as an on-screen keyboard types those, and no key in a field marks the device as having a keyboard.

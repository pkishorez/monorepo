---
'@kestack/auth-toolkit': patch
---

A signed-in reload opens straight from what this device kept, with no flash of loading screens. Switching Account draws the next one in one step.

`browser`'s `cache` remembers the last Accounts, so `state` starts `Checking { last }`. A cache that can't be read or written logs a warning.

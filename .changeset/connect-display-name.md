---
'@kestack/connect': patch
---

A Connection can be given a Display Name, which Connect Cloud keeps.

**Added**

- `Rename` on Connect Cloud gives one of the caller's Connections a Display Name, trimmed, or clears it when given null or a blank one. It works while the Connection is out of reach.
- `Connection` v2 carries `displayName`, null until one is given. `name` stays the Computer Name the Connection reports, so two Connections given the same Display Name can still be told apart.
- `DISPLAY_NAME_MAX`, the longest Display Name: 64 characters.

**Changed**

- A Report no longer changes the Display Name, only the Computer Name.

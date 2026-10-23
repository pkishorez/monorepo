---
'@kestack/auth-toolkit': patch
---

The root door also exports the Guard's errors (`Unauthenticated`, `Unavailable`, `Forbidden`, `AccountChanged`) by name, so a package that publishes a guarded client's type can name them.

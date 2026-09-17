---
'kstack': patch
---

Switch between git worktrees of a project in Monoverse and Laymos. Registered projects now live in the DevTools database instead of browser storage and can be edited or removed; the selected project and worktree live in the URL. This is a backward compatible change: existing RPCs, the CLI, and the database file are unchanged, and the only effect is that projects previously saved in the browser need to be added once more.

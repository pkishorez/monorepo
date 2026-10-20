---
'@kestack/auth-toolkit': patch
---

`AccountsState.SignedIn` says when an Account Switch is under way: `switchingTo`, the Account it makes active, from the moment `switchTo` is called until the Auth Worker confirms it. The Active Account stays the one before until then. A switch that fails puts the state back as it was and fails. A peer tab's change that arrives during a switch is checked rather than trusted. This works the same in `browser()`, both modes, and in `device()`. The Auth Worker's pages show a switch only once it has been under way 150 ms, then for at least 300 ms. Meanwhile the page stays dimmed and still, its new Account's data swapped in one step with no loading screen between.

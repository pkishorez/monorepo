---
'@kestack/connect': patch
'@kestack/auth-toolkit': patch
---

Two `ke-connect serve` of one Connection at once: only one signs in; the other says it is already running. A Device sign-in gives up as soon as its Auth Worker moves.

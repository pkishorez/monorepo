---
'@kestack/connect': patch
'@kestack/auth-toolkit': patch
'@kestack/cli-platform': patch
---

Two `ke-connect serve` of one Connection at once: only one signs in and starts its Plugins; the other stops, saying it is already starting. A Device sign-in gives up as soon as its Auth Worker moves, at any step, and never keeps a token from the Worker it left. `./files` exports `tryLock` and `lockPort`.

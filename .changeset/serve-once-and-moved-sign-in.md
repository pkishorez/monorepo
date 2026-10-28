---
'@kestack/connect': patch
'@kestack/auth-toolkit': patch
---

`ke-connect serve` holds the Connection's control socket before it signs in, so of two serves at once only one signs in or starts its Plugins; the other says it is already running. While it starts, `status` says so and `stop` ends the start. A Device sign-in gives up as soon as its Auth Worker moves, at any step, and never keeps a token from the Worker it left.

---
'@kestack/connect': patch
---

Connect takes each Message and runs each Worker in the State it acts in, SigningIn or SignedIn, instead of checking the State in every rule; only `StopRequested` and `control` stay at the top.

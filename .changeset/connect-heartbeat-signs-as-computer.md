---
'@kestack/connect': patch
---

`@kestack/connect/browser`: each computer's Heartbeat is signed as the computer's own Sign-in, never as the tab's Active Account: a tab that starts with nobody signed in no longer has every computer refused and stopped signed out, so its Connections stayed Connecting after a sign-in.

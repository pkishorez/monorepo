---
'@kestack/connect': patch
'@kestack/auth-toolkit': patch
'@kestack/ai-toolkit': patch
'@kestack/web-platform': patch
---

Each Fake's Control says what it does, as its payload's `description`, so DevTools shows it beside the Control. The Computers fake takes a computer by its name as well as its id, and `AddComputer` needs only a name; `GoOffline`'s `downAtOnce` is optional.

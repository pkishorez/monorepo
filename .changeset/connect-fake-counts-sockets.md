---
'@kestack/connect': patch
---

`@kestack/connect/browser`: `Computers` is told how many sockets each computer's tunnel holds (`sockets(id, open)`), as the number changes. `@kestack/connect/fake`: each computer's Model shows it (`sockets`), none after a reload, so a person can see an App close its sockets and open them again.

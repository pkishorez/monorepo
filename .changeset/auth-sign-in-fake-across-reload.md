---
'@kestack/auth-toolkit': patch
---

`@kestack/auth-toolkit/fake`: a sign-in asked on a page after a reload waits for its own answer, never taking one an earlier page had (each page marks its sign-ins' ids). `browserOver({ leave })` says how the page leaves for where a sign-in comes back to, so a Fake World kept across a reload can be saved first.

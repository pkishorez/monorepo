---
'@kestack/connect': patch
---

`startSession` takes an optional `id`, a ULID chosen by the App so it knows the new Session before the answer comes. The Machine starts the Session under it; asked again with one of the same Project's, it starts nothing and answers with that Session as it is now, so a start asked twice never makes two. An id that is no ULID, or is another Project's Session's, is not used: the Machine chooses one, as it does without one.

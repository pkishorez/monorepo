---
'@kestack/std-toolkit': patch
---

Replica knows when it is Caught Up: a Collection, or a Window of one, whose Strategy has had its first answer from the Backend since it started running, even an answer with nothing in it. A Query's Model gains `caughtUp`, true once every Collection and Window it reads is Caught Up, so a view shows stored rows at once, a skeleton while there are none and it is not Caught Up, and believes an empty list after. An Instance's Model lists its Caught Up scopes under `caughtUp`. The Leader tells the other tabs through the Store which scopes are Caught Up, and a tab never trusts what a Leader that crashed told. Strategies now yield their first answer even when it is empty; a `subscribe` feed answers with its first batch, so one with nothing to replay should send an empty batch first.

---
'effect-oak': patch
---

Breaking: every value an Actor's Schemas describe is checked as it is made, in every build: each Message as it is Sent, each Input, and each Model and State from init or an Update. A value that does not match throws a `TypeError` naming the Actor and the field, and changes nothing. `Actor.make` now takes codecs that need no Capabilities (`Schema.Codec<T, unknown, never, never>`) for `input`, `model`, `message` and `state`.

# Draft versions

A draft is a dev-time overlay, not a version. `.draft(delta, { forward, backward })`
lets an application read and write a next shape before that shape is ever
published — without moving what actually gets written to storage.

Reading always runs the normal migration chain up to the last published
version, then the draft's `forward` migration on top. Writing runs the
draft's `backward` migration first, then encodes and stamps `_v` against that
same last published version — persisted bytes never move while a draft is in
place. Because of that, a draft is invisible to a Snapshot: capture, diff, and
both baselines only ever see published `.evolve()` versions.

Promoting a draft is not a runtime call. It is a plain edit to the schema's
own source — replace `.draft(delta, { forward, backward })` with
`.evolve(nextVersion, delta, forward)`, dropping `backward` (encode now
targets the new latest directly, so nothing downgrades it any more).

---
'@pkishorez/effect-trace-recorder': patch
'@pkishorez/lotel': patch
'laymos': patch
---

Move the Effect trace recorder into its own package, `@pkishorez/effect-trace-recorder`.

**Breaking:** the `@pkishorez/lotel/trace` subpath export has been removed. Import
`makeTraceRecorder` and the `Captured*` types from `@pkishorez/effect-trace-recorder`
instead:

```diff
-import { makeTraceRecorder } from '@pkishorez/lotel/trace';
+import { makeTraceRecorder } from '@pkishorez/effect-trace-recorder';
```

The recorder never used anything from lotel's server, and lotel never used the
recorder — pulling it out lets consumers capture Effect spans without depending on
the OTLP server, and drops `laymos`' dependency on `@pkishorez/lotel` entirely.
This removes the `std-toolkit -> laymos -> lotel -> std-toolkit` workspace cycle
that made build ordering non-deterministic.

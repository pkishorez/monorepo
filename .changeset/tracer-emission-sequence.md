---
'@pkishorez/effect-tracer': patch
'@pkishorez/lotel': patch
---

Order spans and logs strictly by emission, even when they share a millisecond. The tracer stamps one process-wide sequence on every span and log: the recorder keeps it as `sequence` on captured spans and logs and uses it to break timestamp ties, and the OTLP and dev telemetry layers carry it as the `tracer.sequence` attribute. lotel orders Flow Items by that sequence when present, falling back to arrival order, and hides `tracer.*` attributes like `flow.*`.

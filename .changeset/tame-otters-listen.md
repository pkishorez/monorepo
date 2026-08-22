---
'@pkishorez/effect-tracer': patch
---

`TraceRecorder` gains a `layer` door - an Effect `Layer` that installs the recorder's tracer and logger into a Runtime once, so every Effect that Runtime subsequently runs is recorded automatically. `instrument` still works for tracing one Effect in isolation. `TraceRecorder` is now exported from `recorder`, since a caller building this layer's host component needs to name it.

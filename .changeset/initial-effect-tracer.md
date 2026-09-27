---
'@kstackz/effect-tracer': patch
---

Initial release under the `@kstackz` scope.

Sends an Effect program's spans and logs to two places: an in-memory recorder that tests and panels can read, and OTLP export to a collector such as DevTools. You need it to see what your Effect code did, both in tests and while developing.

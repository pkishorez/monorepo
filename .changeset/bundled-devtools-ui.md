---
'@pkishorez/devtools': minor
'laymos': patch
---

Bundle the DevTools UI with the local server: `devtools` now serves its own home page, Lotel, and Laymos at the loopback address instead of redirecting to a hosted app. Laymos Story proofs run with a fixed log level and their own logger set, so a proof that captures its logs behaves the same in DevTools as in the CLI.

---
'@kestack/web-platform': patch
---

Two modes only, real and fake. Breaking: `app()` no longer swaps auth-toolkit's Fake in under `vite dev` (nor serves every backend at `/rpc-<name>`, nor lets in Cloudflare tunnel hosts for it), and `backend(at)` no longer does under `alchemy dev`; `KESTACK_AUTH` means nothing. The production check stays and is general: a build any of whose chunks carries `kestack-fake`, the mark every fake module carries, a lazy chunk too, fails.

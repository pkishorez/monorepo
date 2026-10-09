---
'@kstackz/ai-toolkit': patch
'@kstackz/auth-toolkit': patch
'@kstackz/effect-tracer': patch
'@kstackz/effect-webrtc': patch
'@kstackz/web-platform': patch
'@kstackz/rpc-toolkit': patch
'@kstackz/std-toolkit': patch
'laymos': patch
'use-effect-ts': patch
---

Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

Other peer changes:

- The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
- pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
- std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

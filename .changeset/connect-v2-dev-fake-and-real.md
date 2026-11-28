---
'@kestack/connect': patch
'@kestack/connect-cloud': patch
---

`pnpm dev` runs Connect v2 on fakes and `pnpm dev:real` runs the Connection `dev` on every real Service, against this branch's Connect Cloud, which the Cloud's new `pnpm dev` serves locally under `alchemy dev`.

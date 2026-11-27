---
'@kestack/connect': patch
---

Two modes only, real and fake. `pnpm dev` signs the branch's Connection, `dev-<branch>`, in through the Auth Worker; the fake dev sign-in, its `--conditions`, `dev:real` and the `dev-<branch>-real` Connection are gone (an older one is removed as gone). `./browser` and `./fake` carry the `kestack-fake` mark, so a production build that brings them in fails.

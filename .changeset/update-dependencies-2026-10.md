---
'laymos': patch
'@kestack/kabuki': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
'@kestack/rpc-toolkit': patch
'@kestack/std-toolkit': patch
---

Dependencies updated to their latest versions. Peers a consumer installs moved with them: `alchemy` is now `2.0.0-beta.84`, `@tanstack/db` `0.15.2`, `@tanstack/react-db` `0.5.12`, `@vitejs/plugin-react` `6.1.2`, and `playwright-core` `^1.64.1`.

- Alchemy 2.0.0-beta.84 moves each cloud into its own package, so the Alchemy parts take new optional peers: `@alchemy.run/cloudflare` (web-platform, auth-toolkit, rpc-toolkit, std-toolkit) and `@alchemy.run/aws` (std-toolkit). Import `@alchemy.run/cloudflare` where you imported `alchemy/Cloudflare`. std-toolkit's `providers()` runs on Cloudflare's, so give them to it: `stdToolkitProviders().pipe(Layer.provideMerge(Cloudflare.providers()))`.
- auth-toolkit: better-auth 1.7.12 no longer writes `account.issuer`, so a new migration drops that column and its index. Redeploying the Auth Worker applies it.
- kabuki: works with React 19.3. The first draw calls `use()` on every render, and the Document leaves out scripts the browser would draw itself, since those never run.
- std-toolkit: works with TanStack DB 0.15, which subscribes a live query to its Collections only once it is preloaded.

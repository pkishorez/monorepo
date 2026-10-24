---
'laymos': patch
'@kestack/kabuki': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
'@kestack/rpc-toolkit': patch
'@kestack/std-toolkit': patch
---

Dependencies updated to their latest versions. Peers a consumer installs moved with them: `alchemy` is now `2.0.0-beta.83`, `@tanstack/db` `0.15.2`, `@tanstack/react-db` `0.5.12`, `@vitejs/plugin-react` `6.1.2`, and `playwright-core` `^1.64.1`.

- auth-toolkit: better-auth 1.7.12 no longer writes `account.issuer`, so a new migration drops that column and its index. Redeploying the Auth Worker applies it.
- kabuki: works with React 19.3. The first draw calls `use()` on every render, and the Document leaves out scripts the browser would draw itself, since those never run.
- std-toolkit: works with TanStack DB 0.15, which subscribes a live query to its Collections only once it is preloaded.

---
'auth-toolkit': patch
---

Store all persisted auth state in the primary database and remove secondary storage support. This avoids duplicate session writes and Cloudflare KV's consistency and atomic-operation limitations; secondary storage can be reconsidered after measuring performance.

Remove `secondaryStorage` from `createAuthWorker` calls and remove imports from `auth-toolkit/secondary/cf-kv`, `auth-toolkit/secondary/memory`, and `auth-toolkit/alchemy/cf-kv`; these subpaths and their providers have been removed. Remove the KV binding and resource from consuming deployment definitions. Keep the existing primary database and its migrations: sessions were already persisted there, so no schema migration is required. Cookie caching and the disabled Better Auth rate limiter retain their existing settings.

---
'auth-toolkit': patch
---

Initial release of `auth-toolkit`: curated `better-auth` building blocks for a single shared Auth Worker (Cloudflare D1 + KV), with a `client` subpath for React session hooks and a `server` subpath for backend-to-backend session verification. Includes D1 and in-memory primary database Providers, Cloudflare KV and in-memory session store Providers, and Alchemy resources for provisioning the D1 database and KV namespace.

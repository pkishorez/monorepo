# Spec: an app is its API, its Backend, and what its client keeps

ADR: docs/adr/0004-an-app-is-api-backend-and-stores.md

## Requirements

1. The Gate's Backends are `cloud` and `device`. Stored or launched `remote`/`local` are read as `cloud`/`device`; `?backend=` takes either.
2. auth-toolkit `./app`: `AppPlatform` (gate pieces, `table(source, database)`, `sync` (Std Sync's platform, with `list` and `remove`), `cloud` {auth, url, manageAccounts}) and `createApp({ platform, cloud, device, session })`:
   - `cloud`: the Backend Link's Layer to the cloud Backend; Auth comes from the platform.
   - `device`: loaded on first choice; Auth is the device's own sign-in (`authLocal`), kept in the platform's `device` database.
   - `session(account)`: the Session, scoped.
   - Deletes the Std Sync of every user no longer signed in on the cloud Backend (`syncName(userId)`).
   - Returns `gate`, `SignedIn`, `SignedOut`, `useGate`, `useAccounts` (with `manage`), `useSession`, `platform`.
3. std-toolkit: `inOrder()` (each key's writes reach the Backend in order) exported from `./sync`.
4. web-toolkit `./client`: `webPlatform({ name, authUrl })`: IndexedDB tables and Std Sync, `authLive`, the API at this origin. `createWebApp` goes.
5. expo-toolkit `./gate`: `expoPlatform({ name, apiUrl, auth })`: expo-sqlite tables and Std Sync, `authExpo`, secure storage. `createExpoApp` goes.
6. Ledger core: `api/`, `model/`, `backend/{backend.ts, handlers/, services/{table,auth}/{index?,cloud,device}}`, `app/{link (BackendLink { api, syncPlatform }), session, cache/settings, commands, places (with views), ledger.ts}`. No `client/platform`, `client/gate`, `client/backends`, `state/local-copies`, `server/`, `shared/`.
7. Ledger web: `src/{app.ts, router.tsx, routes/, screens/, worker.ts, infra/, styles.css}`.
8. Ledger Expo: `src/ledger/app.ts` is `createLedger(expoPlatform(...))`; no `src/platform`.
9. Words in UI and docs: Cloud and Device for the two Backends.
10. Everything passes: lint, tests, builds, Ledger web in a browser on both Backends, Expo export.

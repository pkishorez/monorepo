# The three area Toolkits are three doors each, and the front end holds two choices

rpc-toolkit, auth-toolkit and std-toolkit are the platform-free first principles every kstack app and Platform is built on, and their public surface had grown to 19, 8 and many subpaths with overlapping words (five meanings of "local", three of "session", three of "backend", four of "platform"). Each now reads as a few nouns with one door per side, and the app's client holds exactly two choices: which Backend (`cloud` or `device`), and which Platform (web or expo). Everything else is a part underneath a door, exported for the unusual app and never needed by the usual one.

- **rpc-toolkit** is `Rpc` and `HttpApi`. Each has `middleware` (the former Cannotation). `Rpc` has three Transports, each a client and server pair with the protocol fixed: `http` (POST, NDJSON, batched), `websocket` (the hibernating Durable Object), `inProcess`. No protocol is configurable; client and server always agree.
- **auth-toolkit** is `worker` (the sign-in service), `guard` (the contract both sides import: `Authz`, built on `Rpc.middleware`), `server` (`authz.layer` and the resolver as a Service with `cloud` and `device` versions) and `client` (`createApp`, with the Sign-in mechanisms underneath: `signIn.named` in `client`, and `cookie`, `oauth`, `deviceCode` each in a door of its own, `client/web`, `client/expo`, `client/cli`). The CLI and MCP corners stay behind the same doors. "Local" leaves the vocabulary: a Named Account signs in by name with a Name Token.
- **std-toolkit**'s Sync gets the same adapter names as Table: `Sync.idb`, `Sync.sqlite`, `Sync.memory`. Whether a place is shared by tabs (and so needs leadership and a doorbell) is a fact about the storage, so it lives inside the adapter, and "sync platform" is gone.
- `createApp` hands the app's `session` function a finished signed `rpc` client and a `sync` already named for the user, over HTTP on the cloud Backend and in-process on the device Backend. The Backend Link, the RPC runtime, `waitForToken`, `whileOpen` and `syncName` stop being things an app sees.

## Considered Options

- **Keep the protocol configurable** (NDJSON or JSON, HTTP or WebSocket per call): rejected. A client and server that can disagree are one more thing to check at consumption; a fixed protocol is a standard. It can become configurable later without changing the door.
- **Drop the HttpApi middleware flavour** (it had no consumer): rejected. Middleware is one mechanism for both API styles, or the story has an asterisk.
- **Fold `guard` into `server`** so auth-toolkit has exactly three doors: rejected. The browser would depend on server code; the contract both sides import has to be its own tiny door, as `rpc` was.
- **Keep the sync platform as the consumer's choice**: rejected. The consumer chooses where a sync is kept; leadership and cross-tab doorbells follow from that choice and are the adapter's business.

## Consequences

- web-platform and expo-platform lose what sat on the old APIs (`webPlatform`, `expoPlatform`, their gate platforms, `serveRpc`) and are rebuilt on the new doors in the next phase, as Platforms.
- Ledger is made to compile and run on the new doors first, and rethought after.
- Ledger's `app/link/`, `session/rpc.ts` and `backend/services/auth/` become toolkit code.

# @kestack/effect-webrtc

## 0.0.3

### Patch Changes

- [#71](https://github.com/pkishorez/monorepo/pull/71) [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38) Thanks [@kishorenuma](https://github.com/kishorenuma)! - auth-toolkit is rebuilt around three Caller Kinds (Browser, Device, OAuth) and four doors. The root exports one `Auth` guard for RPC and HttpApi; `server/rpc` and `server/http` each take one `auth({ url })`; `client/browser` and `client/device` each give one Layer for the `Accounts` service; `worker` exports `authWorker`, configured by `cookieDomain`, `brand` and an `oauth` resources map. Browser apps never hold tokens and send `expect-user`, so a switch in another tab fails Account Changed instead of acting as the wrong User. The Device and Consent Screens approve as a chosen Account without switching, and the Auth Worker's pages are a new Kabuki app whose pages arrive with their data, read by Loaders inside the worker. Their header has a light/dark Theme toggle, following the system until pressed. Breaking: `guard`, `server`, `server/cloud`, `client/web` and `client/cli` are gone, as are `Authz`, `SignIn`, `DeviceCode`, `trustedOrigins` and Test Sign-In.

  web-platform's Gate now runs on `Accounts` (XState removed), its Device Backend is the Local Backend, and its server takes `auth: { url, oauth? }`. effect-webrtc takes `cookieDomain` instead of `trustedOrigins`. kabuki's page types no longer ask a parent for what it provides to its child pages.

- Updated dependencies [[`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38), [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38)]:
  - @kestack/rpc-toolkit@0.0.3
  - @kestack/auth-toolkit@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @kestack/auth-toolkit@0.0.2
  - @kestack/rpc-toolkit@0.0.2

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: Peer Sessions are traced with Effect spans instead of Flow. On the wire, `NegotiationEnvelope`'s `flow` field is now `trace`, so a Peer on 0.0.0 cannot negotiate with one on this version; update every Peer and redeploy the Durable Signaling worker together. `FlowCarrierSchema`, `FlowMessageTokenSchema` and `FlowCarrier` are removed, and so is the `@kestack/flow` peer. Needs Effect `^4.0.0`; the optional `alchemy` peer is now `2.0.0-beta.80`.
- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/auth-toolkit@0.0.1
  - @kestack/rpc-toolkit@0.0.1

---
'@kestack/auth-toolkit': patch
'@kestack/web-platform': patch
'@kestack/effect-webrtc': patch
'@kestack/kabuki': patch
---

auth-toolkit is rebuilt around three Caller Kinds (Browser, Device, OAuth) and four doors. The root exports one `Auth` guard for RPC and HttpApi; `server/rpc` and `server/http` each take one `auth({ url })`; `client/browser` and `client/device` each give one Layer for the `Accounts` service; `worker` exports `authWorker`, configured by `cookieDomain`, `brand` and an `oauth` resources map. Browser apps never hold tokens and send `expect-user`, so a switch in another tab fails Account Changed instead of acting as the wrong User. The Device and Consent Screens approve as a chosen Account without switching, and the Auth Worker's pages are a new Kabuki app whose pages arrive with their data, read by Loaders inside the worker. Their header has a light/dark Theme toggle, following the system until pressed. Breaking: `guard`, `server`, `server/cloud`, `client/web` and `client/cli` are gone, as are `Authz`, `SignIn`, `DeviceCode`, `trustedOrigins` and Test Sign-In.

web-platform's Gate now runs on `Accounts` (XState removed), its Device Backend is the Local Backend, and its server takes `auth: { url, oauth? }`. effect-webrtc takes `cookieDomain` instead of `trustedOrigins`. kabuki's page types no longer ask a parent for what it provides to its child pages.

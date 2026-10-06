---
'@kstackz/auth-toolkit': patch
---

Native apps sign in as First-Party Clients. `authorizationServer.firstPartyClients` lists a fixed public OAuth client with PKCE, no consent, exact redirect URIs (an app's own scheme is fine) and its own Resource Server with 15-minute Access Tokens; refresh tokens turn over on every use, and a reused one revokes the chain. The new `@kstackz/auth-toolkit/clients/auth/expo` entry gives a phone the same `Auth` service (`authExpo`, plus `manageAccounts`), with expo-auth-session, expo-secure-store and react-native as optional peers used only there. `testSignIn: { stage: 'local' }` adds a Test Sign-In for `.test` emails that refuses to start on any other stage. `trustedOrigins` now matches an app scheme by scheme and path, and never the opaque origin `null`.

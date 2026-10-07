---
'@kstackz/auth-toolkit': patch
---

`authLive` moves to its own entry, `@kstackz/auth-toolkit/clients/auth/live`; `clients/auth` no longer exports it. `clients/auth` is now platform-free (the `Auth` service, `authLocal`, `signedFetch`), so a React Native app that uses it, where Metro bundles every import, no longer loads better-auth's browser client. Import `authLive` from the new entry. `react-native` is no longer a peer: the Expo target opens pages with `expo-web-browser`.

---
'@kstackz/auth-toolkit': patch
---

The client door is sign-in only. `createApp`, the Gate (`createGate`, `gateReact`), `memoryPlatform`, `Backend`, `backendNamed`, `keepSyncs` and the Session types move to `@kstackz/web-platform`. What stays is `SignIn`, `Account`, `User`, `Unreachable`, `signIn.named` with its chooser and table, and the Name Token; `cookie`, `oauth` and `deviceCode` keep their own doors. Import an app's `createApp` from your Platform instead.

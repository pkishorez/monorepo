---
'@kstackz/platform-toolkit': patch
---

Initial release under the `@kstackz` scope.

Runs an app on any platform. `createApp` takes the app's named APIs (`Api.http`, `Api.websocket`), its device Backend (every API's handlers on the device's Storage), its cache, and, with `auth`, a Session written once with `defineSession`. It gives the Gate (several Accounts on one device, Open First, Account Lost), one Session per active Account with every API signed as them, `useSession`, `useRun`, `useStatus` and `useApi`, and public calls outside any Session. A Session's calls are interrupted when it closes, and a run rejects with `SessionClosed`. The Web and Expo Platforms are built on it; an app calls its Platform's `createApp`. See ADR 0006.

---
'@kstackz/expo-platform': patch
---

Initial release under the `@kstackz` scope, with its own version (ADR 0006), shipped as TypeScript source for Metro.

The Expo Platform: a native app (Expo SDK 57) from one config. `createApp` takes the app's `name`, `title`, `apiUrl`, `apis`, `device` Backend, `cache` and `auth` (the sign-in service's `url`, the app's `clientId` and `resource`, the `session`, and `presets`), and gives `Root` for the root layout, `SignedIn` with the screens before sign-in drawn for you, and the Platform Toolkit's hooks. The phone's Host is built in: SQLite tables and Std Sync, OAuth sign-in in the system sheet, the network and the foreground. Underneath are the parts to build screens with: Ledger's colours and Inter as Uniwind tokens, owned Panel UI components, haptics, touch input on `@kstackz/use-gesture`, and Recipes that match the Web Platform's. It replaces `@kstackz/expo-toolkit`, which was never released.

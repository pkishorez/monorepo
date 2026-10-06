# @ledger/expo

Ledger on iOS and Android: an Expo Router app on the Expo Toolkit that talks to @ledger/web's /rpc and never hosts a server.

## Big picture

The native shell of Ledger (glossary: [`../CONTEXT.md`](../CONTEXT.md)). Everything below the screens comes from `@ledger/core`, made once over this app's platform Layer (`src/platform`: expo-sqlite, secure storage, expo-network, AppState); the look, components, Sidebar, haptics and sound come from `@kstackz/expo-toolkit`. It targets Expo SDK 57 and runs in Expo Go until a custom native module or the `ledger://` scheme needs a development build. Build notes: [`../NOTES.md`](../NOTES.md).

The app is thin, laid out in [Laymos](laymos.config.json) layers: `entry` (`index.ts` readies Hermes, then one thin route per Place in `app/`), `client-screens` (`src/screens`: the shell, each Place, shared parts), `client-ledger` (`src/ledger`: Ledger's client from core, the remembered theme, the sounds of Commands), `client-platform` and `runtime`. Place screens live in `src/screens/places/<place>`; gestures mount in `src/screens/shell/gestures.tsx`.

Today it runs on the Local Backend: Splash, sign-in by name, every Place (Home, Entries and an Entry, Months and a Month, Settings with General and Gestures), the Add and Accounts sheets, rows swiped to delete, the Sidebar with the User Switcher and balances and its edge swipe, and the Thumb Lock with its Place Picker, Gesture Sounds and Gesture Haptics. What each Place shows is worked out in `@ledger/core/client/views`, shared with the web. Signing in to the Remote Backend arrives in Phase 4. Screens: [`docs/screens/`](docs/screens/).

## Usage

```sh
xcrun simctl boot "iPhone 17 Pro"   # once; "already booted" is fine
pnpm --filter @ledger/expo ios      # expo start --ios: Metro, then Expo Go on the Simulator
```

`pnpm --filter @ledger/expo start` starts Metro alone; open `exp://127.0.0.1:8081` on the Simulator with `xcrun simctl openurl booted exp://127.0.0.1:8081`, or scan the QR code with Expo Go on a phone. A link with `?backend=local` (`exp://127.0.0.1:8081/--/?backend=local`) starts on the Local Backend, and `/--/<route>` opens a Place, such as `/--/settings?tab=gestures`. `EXPO_PUBLIC_LEDGER_URL` names the Remote Backend's origin. `pnpm --filter @ledger/expo lint` type-checks and runs `laymos lint`. Agents tap through the app with `node scripts/drive.mjs tap "<label or text>"` (Metro's inspector calls the element's `onPress`; `type "<label>" "<text>"` fills a field; `METRO_PORT` picks another Metro) and see it with `xcrun simctl io booted screenshot`.

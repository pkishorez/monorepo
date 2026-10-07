# @ledger/expo

Ledger on iOS and Android: an Expo Router app on the Expo Toolkit that talks to @ledger/web's /rpc and never hosts a server.

## Big picture

The native shell of Ledger (glossary: [`../CONTEXT.md`](../CONTEXT.md)). Everything below the screens comes from `@ledger/core`, made once in `src/ledger/app.ts` on its own Platform, `src/ledger/platform.ts` (expo-sqlite, secure storage, expo-network, AppState) with this build's cloud addresses; the look, components, Sidebar and haptics come from `@kstackz/expo-toolkit`. It targets Expo SDK 57 and runs in Expo Go until a custom native module or the `ledger://` scheme needs a development build. Build notes: [`../NOTES.md`](../NOTES.md).

The app is thin, laid out in [Laymos](laymos.config.json) layers: `entry` (`index.ts` readies Hermes, then one thin route per Place in `app/`), `screens` (`src/screens`: the shell, each Place, shared parts), `ledger` (`src/ledger`: Ledger from core, the remembered theme, the haptics of gestures) and `runtime`. Place screens live in `src/screens/places/<place>`; gestures mount in `src/screens/shell/gestures.tsx`.

It runs on the device Backend: Splash, sign-in by name, every Place (Home, Entries and an Entry, Months and a Month, Settings with General and Gestures), the Add and Accounts sheets, rows swiped to delete, the Sidebar with the User Switcher and balances and its edge swipe, and the Thumb Lock with its Place Picker. Gestures answer with light haptics; the phone makes no sounds. What each Place shows is worked out in `@ledger/core/app/places`, shared with the web. On the cloud Backend each User signs in through the system sign-in sheet as Ledger's First-Party OAuth client (Ledger ADR 0009, auth-toolkit's `clients/auth/expo`), keeps their tokens in secure storage and their copy in SQLite, and syncs with `@ledger/web`'s `/rpc`; Switch User, Add User, Sign Out and Manage Google accounts work as on the web. Screens: [`docs/screens/`](docs/screens/).

## Usage

### Run it on the iOS Simulator

Boot a Simulator, then start Metro and Expo Go on it. On the device Backend nothing else is needed.

```sh
xcrun simctl boot "iPhone 17 Pro"   # once; "already booted" is fine
pnpm --filter @ledger/expo ios      # Metro, then Expo Go at exp://127.0.0.1:8081
```

- `pnpm --filter @ledger/expo dev` stops whatever holds port 8081 (`METRO_PORT`) and starts a fresh Metro; extra arguments go to `expo start` (`--ios`, `--tunnel`).
- `pnpm --filter @ledger/expo start` starts Metro alone; open it with `xcrun simctl launch booted host.exp.Exponent --initialUrl exp://127.0.0.1:8081`, or scan the QR code with Expo Go on a phone.
- `exp://127.0.0.1:8081/--/?backend=device` starts on the device Backend (`?backend=cloud` on the cloud one; the former `local` and `remote` still work); `/--/<route>` opens a Place, such as `/--/settings?tab=gestures`.
- `pnpm --filter @ledger/expo lint` type-checks and runs `laymos lint`.

### Sign in on the cloud Backend

The app points at the Mac's local servers in development and at `kishore.app` in a release build. Start the sign-in service (`pnpm dev` in the `mine` repo's `packages/auth`, `https://auth.kishore.computer`) and Ledger web (`pnpm dev` in `ledger/web`), trust portless's CA once, and open Expo Go at `127.0.0.1` (not the LAN address), whose `exp://127.0.0.1:8081/--/oauth/callback` is the redirect the sign-in service accepts.

```sh
xcrun simctl keychain booted add-root-cert ~/.portless/ca.pem
EXPO_PUBLIC_LEDGER_URL=https://<branch>.kstack.kishore.computer pnpm --filter @ledger/expo ios
```

- `EXPO_PUBLIC_LEDGER_URL` is Ledger web's origin, `EXPO_PUBLIC_AUTH_URL` the sign-in service, `EXPO_PUBLIC_LEDGER_RESOURCE` the audience `/rpc` checks (`https://kstack.kishore.computer/rpc` locally).
- On the `local` stage the sign-in sheet's Login Screen offers "Test sign-in (local only)" (Ada, Grace `@ledger.test`) besides Google.

### Run it on the Android emulator

```sh
adb reverse tcp:8081 tcp:8081
pnpm --filter @ledger/expo android   # or: adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent
```

- For the cloud Backend the emulator must resolve `*.kishore.computer` to the Mac (`10.0.2.2` in a writable `/system/etc/hosts`) and trust portless's CA; the steps are in [`../NOTES.md`](../NOTES.md) (Phase 5: Android).
- Agents drive the iOS app with `node scripts/drive.mjs tap "<label or text>"` (calls the element's `onPress` through Metro's inspector) and inject a Thumb Lock with `node scripts/touch.mjs`; both work only in a development bundle (`__DEV__`), never in a release.

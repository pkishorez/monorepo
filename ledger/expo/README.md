# @ledger/expo

Ledger on iOS and Android: an Expo Router app on the Expo Toolkit that talks to @ledger/web's /rpc and never hosts a server.

## Big picture

The native shell of Ledger (glossary: [`../CONTEXT.md`](../CONTEXT.md)). Everything below the screens comes from `@ledger/core`; the look, components, haptics and sound come from `@kstackz/expo-toolkit`. It targets Expo SDK 57 and runs in Expo Go until a custom native module or the `ledger://` scheme needs a development build. Build notes: [`../NOTES.md`](../NOTES.md).

Today it is a one-screen shell proving the toolkit renders ([`docs/screens/phase-2-blank.png`](docs/screens/phase-2-blank.png)); the Places arrive in Phase 3.

## Usage

```sh
xcrun simctl boot "iPhone 17 Pro"   # once; "already booted" is fine
pnpm --filter @ledger/expo ios      # expo start --ios: Metro, then Expo Go on the Simulator
```

`pnpm --filter @ledger/expo start` starts Metro alone; open `exp://127.0.0.1:8081` on the Simulator with `xcrun simctl openurl booted exp://127.0.0.1:8081`, or scan the QR code with Expo Go on a phone. `pnpm --filter @ledger/expo lint` type-checks.

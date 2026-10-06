# Ledger is a core, a web app, and an Expo app

Status: accepted

Ledger runs natively on iOS and Android as well as in the browser. It moves
out of `apps/kstack` into a top-level `ledger/` folder of three private
packages.

- `@ledger/core` holds everything both apps share: the words of money, the
  Backend's domain and the Local Backend's server half, the client's domain,
  state, Backends and Gate, and the Commands. It imports nothing from
  `react-dom`, `react-native`, `window`, `document` or `indexedDB`.
- `@ledger/web` is the full-stack app: the TanStack Start pages, the Worker
  that serves the Remote Backend's `/rpc`, the infra, the PWA and the web
  platform Layer, all deployed in one go.
- `@ledger/expo` is the native app. It never hosts a server: its Remote
  Backend is web's `/rpc` (the Mac's local dev server in development,
  `https://kstack.kishore.app` for production builds) and the shared sign-in
  service, which it signs in to as an OAuth client (ADR 0009).

Whatever differs by platform is one **platform Layer** each app hands core:
where things are stored (the Local Backend's table, Settings, Session copies,
listing and deleting local copies), how a User signs in (`Auth`), the app's
lifecycle (online, in view), and the last-User store. Web gives IndexedDB,
better-auth cookies, window events and `localStorage`; Expo gives SQLite,
secure storage, the native `Auth` and AppState. Both apps run the Local
Backend on the device.

## Considered options

- **One universal Expo app for web and native.** Rejected: the web app's PWA,
  Splash, routing and Worker hosting are already tuned, and an Expo web build
  would be a second, weaker web app.
- **An Expo app that imports from `apps/kstack`.** Rejected: nothing would
  stop web-only code reaching the phone; a package boundary and Laymos lint
  do.
- **A top-level `kstack/` folder.** Rejected: kstack names the package
  family, and Ledger is the app built with it.

## Consequences

Web and native always run the same `/rpc`, so a change to the Remote
Backend's server half ships with web and native picks it up without a store
release. Platform-free gesture logic (the Thumb Picker's walk) moves into
`@kstackz/use-gesture`'s core, which web and the Expo Toolkit both build on.
Anything new in core that needs the platform must go through the platform
Layer, never a direct import.

# Ledger is a core, a web app, and an Expo app

Status: accepted

Ledger now runs natively on phones as well as in the browser. It moves out of
`apps/kstack` into a top-level `ledger/` folder of three private packages.
`@ledger/core` holds everything both apps share: the words of money, the
Backend's domain and the Local Backend, the client's domain, state, Backends,
Gate and the Commands. Whatever differs by platform, such as where a copy is
kept, how a User signs in, and when the app is online or in view, is a port
that each app fills. `@ledger/web` is the full-stack app: the TanStack Start
client, the Worker that serves the Remote Backend's `/rpc`, and the infra, all
deployed in one go. `@ledger/expo` is the native app; it hosts no server, and
its Remote Backend is the `/rpc` of the deployed web app. Both run the Local
Backend on the device.

## Considered options

- **One universal Expo app for web and native.** Rejected: the web app's PWA,
  Splash, routing and Worker hosting are already tuned, and an Expo web build
  would be a second, weaker web app.
- **Expo app that imports from `apps/kstack`.** Rejected: nothing would stop
  web-only code reaching the phone; a package boundary and Laymos lint do.
- **A top-level `kstack/` folder.** Rejected: kstack names the package family,
  and Ledger is the app built with it.

## Consequences

Web keeps its own Thumb Picker and key bindings until a later Web Toolkit
absorbs them, so for a while the Thumb Picker's walk lives in both the web app
and the Expo Toolkit, each with its tests. Dev builds of the Expo app talk to
the deployed dev stage of the web app, unless `EXPO_PUBLIC_REMOTE_URL` points
elsewhere.

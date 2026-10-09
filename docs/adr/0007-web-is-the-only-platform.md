# Web is the only platform

Status: accepted. Supersedes the Expo half of [ADR 0006](0006-platforms-may-break-toolkits-keep-what-persists.md), Ledger's [ADR 0009](../../apps/ledger/docs/adr/0009-native-ledger-signs-in-as-an-oauth-client.md) and [ADR 0010](../../apps/ledger/docs/adr/0010-ledger-is-a-core-a-web-app-and-an-expo-app.md), and auth-toolkit's [ADR 0017](../../toolkits/auth-toolkit/docs/adr/0017-first-party-native-apps-are-fixed-oauth-clients.md).

kstack builds for the web alone. The Expo Platform, the Expo Ledger app and everything that existed only for them are gone: the Platform Toolkit (folded into the Web Platform, Host and all), Ledger's platform-free core (merged back into one app in `apps/ledger`), std-toolkit's Expo SQLite driver and `Sync.sqlite`, auth-toolkit's OAuth sign-in on a phone with its First-Party Clients and app-scheme origins, and use-gesture's worklet-safe core. React is no longer held back to the Expo SDK's pin. Every abstraction had to be invented twice, once per platform, and kept in step; one platform is simpler to build, to test and to reason about, and the web reaches every device already, as an installable PWA.

If a native app comes, it will be the web app in a native shell (Capacitor), not a second app on Expo, so the Web Platform stays the single source of truth. Nothing is built for that now; what the shell needs (sign-in in a web view, native storage) is decided when it is real. The Expo work is kept at the `expo-platform-last` tag.

## Considered Options

- **Keep the Expo Platform and Ledger on Expo**: rejected. It doubled every Recipe, gesture and storage seam, and held React to the Expo SDK.
- **Keep the Platform Toolkit and Ledger's core split, delete only Expo**: rejected. Each was a seam with one user left.
- **Expo for web, one universal app**: rejected in ADR 0010 already; the web app's PWA, Splash, routing and Worker are what we keep.

## Consequences

- The Web Platform is no longer a kind of package with siblings: it is the one way to build a kstack app. Its root door is `createApp`; `./define` holds what an app writes before it and loads nothing of the browser app, so a Worker can import it.
- The Gate keeps its stored table (`auth-gate`) and database (`gate`), so devices keep their Remembered Accounts across the move.
- An Auth Worker config that listed `firstPartyClients` or an app-scheme `trustedOrigins` entry must drop it.

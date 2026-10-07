# One Web Toolkit, with the PWA opt-in and the Gate in auth-toolkit

`@kstackz/ui-toolkit` and `@kstackz/pwa-toolkit` merge into `@kstackz/web-toolkit`, laid out like expo-toolkit: one Laymos layer per job, one subpath per layer, bottom to top `theme`, `feedback`, `input`, `components`, `form`, `recipes`, `client`, `pwa`, with `server` beside them. `client` and `server` are the opinionated way in and assume TanStack Start. The PWA sits above `client` and plugs into it, so `client` never imports it: an app that leaves `pwa` out ships no service worker, manifest or Update Prompt.

What runs sign-in on a device (the **Gate**: which Backend, which Signed-in Accounts, the Backend Lifetime and the Session Lifetime) moves out of `ledger/core` into auth-toolkit with no platform code, because the Expo app runs the same Gate. web-toolkit and expo-toolkit give it their platform pieces and their React wiring.

## Considered Options

- **Keep two packages, ui-toolkit and pwa-toolkit**: rejected. Every web app wanted both, and the opinionated setup that ties them (root document, sign-in, server) had no home, so each app copied it.
- **Make every app a PWA, with no way out**: rejected. A PWA is a promise to work offline and update in place; an app should make it on purpose, by adding a layer.
- **Put the Gate in web-toolkit**: rejected. Expo would import a web package or keep a copy.
- **Keep the devtools-only blocks (laymos, otel-trace-viewer, monoverse, flow-swimlane) in web-toolkit**: rejected. They go to a private `@devtools/ui` that `@kstackz/devtools` bundles, so web-toolkit carries only what any web app needs.

## Consequences

- expo-toolkit's `patterns` becomes `recipes`, so a Recipe on either platform is the same interaction.
- The Gate follows **Open First**: an account the device knows opens at once and is confirmed afterwards. Sign Out needs the Backend, because only it can end the sign-in service's cookie.
- web-toolkit ships built `dist/`, unlike expo-toolkit, which Metro compiles from source.

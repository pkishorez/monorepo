# A native app is the web app in a Capacitor shell

Status: proposed, from a spike; not accepted. Would amend [ADR 0007](0007-web-is-the-only-platform.md), which said nothing is built for a native shell until one is real. The spike's evidence is in [`apps/capacitor-kabuki-start/docs/findings.md`](../../apps/capacitor-kabuki-start/docs/findings.md).

A native app is the web app inside a Capacitor shell whose web view opens the live site (`server.url`), with no copy of the site in the app. A deploy is a new version of the app on every device, the Web Platform stays the one source of truth, and the shell is a small, mostly generated project (`apps/capacitor-kabuki-start`).

A native feature is a Capability in `@kestack/web-platform/capabilities`: an Effect Service with a web default that works in any browser, and a version per platform that an app picks in its Layer (`Haptics.layer({ ios })`, `AppInfo.layer({ ios, android })`). A platform with nothing better keeps the web default; Android's haptics are the web's `navigator.vibrate`. Where the page runs is read from the bridge the shell injects, so the web build imports nothing of Capacitor.

The Capacitor plugins are optional peers of web-platform, imported dynamically only inside a shell, so a browser never downloads them. The shell app depends on them directly, which is how `cap sync` finds them and builds them into the native projects. With pnpm that needs no settings: the CLI follows pnpm's links.

Where no official plugin exists, the monorepo writes its own as a package (`@kestack/capacitor-live-activity`), found by `cap sync` through a `workspace:*` dependency as the official ones are. It may be native only: the Capability reaches it by name with `registerPlugin` from `@capacitor/core`, so the page imports no package for it. What iOS requires inside the app itself, such as a widget extension, lives in the shell's project.

The page stays full-screen and unaware of the system bars. The shell keeps its web view between them and paints them in the page's `theme-color`, as a browser does, so the site needs no safe-area code for the app.

## Considered Options

- **Bundle the site into the app (`webDir`)**: rejected for now. Every deploy would need a store release, and the site's Workers and service worker assume their own origin.
- **Import `@capacitor/*` statically in the Capabilities**: rejected. Every web visitor would download the bridge for nothing.
- **A native module per feature in the shell**: rejected. A Capability with a web default keeps one code path for the page and lets each platform opt in.

## Consequences

- Native behaviour is tested in CI on each pull request's preview (`native-kabuki-start.yml`): an Android emulator and an iOS simulator open `/native?proof=1`, and the job fails unless the page proves it ran in the shell.
- iOS gives a remote site a service worker only inside App-Bound Domains, which also limit where the web view may go. Whether the shell turns them on is open.
- The app needs a network for its first launch; offline later depends on the service worker the shell allows.
- The shell's native projects are no longer only generated: the bars and the widget extension are code of its own, and the extension's target is written into `App.xcodeproj`, which `cap add` would overwrite.
- A plugin of our own keeps its Swift and the Capability's TypeScript types in step by hand.
- Store signing, push, sign-in inside a web view and native storage are not decided here.

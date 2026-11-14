# capacitor-kabuki-start

Kabuki Start in a native shell: the Android and iOS apps Capacitor wraps around the site at start.kishore.app.

## Big picture

A spike: can a Web Platform app run inside a native shell and call native
features, with no copy of the site in the app? The shell is Capacitor 8. Its
web view opens the live site (`server.url` in `capacitor.config.js`), so a
deploy of [`kabuki-start`](../kabuki-start/README.md) is a new version of the
app, with no store release. The site calls the native side through the
Capabilities in [`@kestack/web-platform`](../../platforms/web-platform),
which reach Capacitor's plugins (`@capacitor/app`, `@capacitor/haptics`)
when the page runs in a shell, and the web's own APIs when it does not.

`android/` and `ios/` are the native projects `cap add` made, kept as it
wrote them, except for the `VIBRATE` permission in the Android manifest: on
Android the site buzzes with the web's `navigator.vibrate`, which the web
view allows only when the app holds it. `cap sync` rewrites the plugin lists
(`capacitor.settings.gradle`, `CapApp-SPM/Package.swift`) from
`node_modules`, as relative paths into pnpm's store, with no pnpm settings.

CI proves it on every pull request that deploys kabuki-start:
[`native-kabuki-start.yml`](../../.github/workflows/native-kabuki-start.yml)
builds both apps against that preview's `/native?proof=1` page, runs them in
an Android emulator and an iOS simulator (with and without App-Bound
Domains, which is what gives iOS a service worker for a remote site), and
fails unless the page proves it ran in the shell. `scripts/` holds what the
jobs run; the screenshots, logs, the proof and the built apps are the run's
artifacts.

## Usage

### Open a different site

```bash
SHELL_URL=https://pr12-start.kishore.app pnpm exec cap sync    # default: https://start.kishore.app
SHELL_APP_BOUND=true pnpm exec cap sync ios                     # turn on App-Bound Domains (iOS)
scripts/app-bound-domains.sh start.kishore.app                  # and name the host (macOS)
```

- `SHELL_URL` may carry a path and query; both platforms open it as given.
  Its host is also allowed for navigation, so links inside the site stay in
  the app.
- App-Bound Domains needs both lines: the config setting and the
  `WKAppBoundDomains` entry in `ios/App/App/Info.plist`. Undo the entry with
  git when done.
- Run every command here from this folder after `pnpm install`.

### Install on an Android phone

```bash
pnpm run android     # cap sync android, then gradlew assembleDebug: needs JDK 21 and the Android SDK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

- Without a build machine, take `app-debug.apk` from a pull request run's
  `native-android` artifact and open it on the phone, allowing installs from
  that app. That APK opens the pull request's `/native?proof=1` page.
- It is a debug build, so Chrome's `chrome://inspect` on a computer can
  inspect its web view over USB.

### Install on an iPhone with a free Apple ID

```bash
pnpm run ios         # cap sync ios, then opens the project in Xcode (macOS)
```

- In Xcode, add the Apple ID under Settings, Accounts.
- Select the `App` target, then Signing & Capabilities, and choose your
  Personal Team. If Xcode says the bundle identifier is taken, change
  `app.kishore.start` to one of your own.
- Plug in the iPhone, trust the Mac, pick the iPhone as the run destination
  and press Run. iOS 16 and later ask for Developer Mode first (Settings,
  Privacy & Security).
- On the iPhone, trust the developer under Settings, General, VPN & Device
  Management, then open the app.
- A free team's app stops opening after 7 days; press Run again to renew it.

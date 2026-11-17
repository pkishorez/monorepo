---
'@kestack/web-platform': patch
---

Native features as Capabilities with a web default, for an app that also runs in a Capacitor Shell on iOS or Android.

**Added**

- `capabilities/platform`: `platform()` says where the page runs, `web`, `ios` or `android`, from the bridge the Shell puts into the page, with nothing of Capacitor imported. `layerOn(capability)({ ios, android })` makes a Capability's Layer: the platform's own version there, the web default anywhere else or when making it fails.
- `capabilities/haptics`: `Haptics`, an impact, a notification or a selection tick, each saying whether the device took it. With nothing provided it is `navigator.vibrate`. `Haptics.layer({ ios })`, with `ios` from `capabilities/haptics/ios`, uses `@capacitor/haptics` in the iOS Shell.
- `capabilities/app-info`: `AppInfo`, the platform and the Shell's id, name, version and build; by default no Shell. `AppInfo.layer({ ios, android })`, with each from `capabilities/app-info/ios` and `/android`, reads them from `@capacitor/app`.
- `@capacitor/core`, `@capacitor/haptics` and `@capacitor/app` are optional peers, loaded with a dynamic import only inside a Shell, so a browser never downloads them.

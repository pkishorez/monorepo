---
'@kestack/web-platform': patch
---

A Live Activity as a Capability, and the Theme set from outside React.

**Added**

- `capabilities/live-activity`: `LiveActivity` says whether the device can show a Live Activity, and starts one (a title, a status line and how far along, 0 to 1), updates it and ends it by its id. Nothing fails: with nothing provided it is not supported, starts none and answers `false`. `LiveActivity.layer({ ios })`, with `ios` from `capabilities/live-activity/ios`, uses the iOS Shell's own `LiveActivity` plugin, reached with `registerPlugin` from `@capacitor/core`, so no other package is needed.
- `ui/theme`: `createTheme` also returns `setTheme`, for code outside React such as a Command.

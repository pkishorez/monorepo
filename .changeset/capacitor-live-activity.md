---
'@kestack/capacitor-live-activity': patch
---

A Capacitor plugin for iOS Live Activities.

**Added**

- The `LiveActivity` plugin: `isSupported`, `start` (a title, a status line and a progress from 0 to 1, returning the activity's id), `update`, `end` and `list`, on iOS 16.2 and later. Swift only; the page reaches it with `registerPlugin('LiveActivity')` from `@capacitor/core`.
- `LiveActivityModel`, a Swift library with the activity's `LiveActivityAttributes` and nothing from Capacitor, for the app's widget extension to link.

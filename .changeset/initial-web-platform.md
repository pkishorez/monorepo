---
'@kstackz/web-platform': patch
---

Initial release under the `@kstackz` scope, with its own version (ADR 0006).

The Web Platform: a web app from one config. `createApp` takes the app's `name`, `title`, `apis`, `device` Backend, `cache`, `auth` (the sign-in service's `url`, the `session`, and `presets` for the device Backend), `theme` and `pwa`, and gives `root` for `createRootRoute`, `SignedIn` with the screens before sign-in drawn for you, and the Platform Toolkit's hooks. Every app is a PWA in its Theme. The `server` door's `createServer` serves each `http` API at its path on the cloud services the app gives, checked by the sign-in service. Underneath are the parts to build screens with: sound feedback, touch and keyboard input, shadcn components and viewers, a form hook, and Recipes (the Frame, Thumb Picker, Swipe Row, Local Sign-In, Account Switcher, Account Lost, Gate Screens). It replaces `@kstackz/ui-toolkit`, `@kstackz/pwa-toolkit` and `@kstackz/web-toolkit`, which were never released.

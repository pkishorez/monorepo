---
'@kestack/web-platform': patch
---

First release. The one way to build a kstack app: `createApp` turns one config into a PWA on TanStack Start with its Theme, its APIs on a cloud or a device Backend, several Accounts with one Session each, and the screens before sign-in. `./define` holds what an app writes before `createApp` (`Api.http`, `Api.websocket`, `defineSession`) and loads nothing of the browser. `./server` has `createServer` and `liveObject`, a Durable Object per user for each `websocket` API that serves only the user it was opened for. Underneath are the parts to build screens with: `theme`, `feedback`, `input` (the browser's touch gestures, on `@kestack/use-gesture`), `components`, `form` and `recipes`, including the Kabuki devtools.

It replaces `@kestack/ui-toolkit` and `@kestack/pwa-toolkit`, which are no longer published; their gestures block is now `./input`. A Gesture ends when its fingers lift, even after the element they landed on has left the page; a touch that finds fewer fingers on the screen than the Gesture under way ends it as Interrupted; and a swipe from a Sidebar's edge always moves the Sidebar and never goes back a page.

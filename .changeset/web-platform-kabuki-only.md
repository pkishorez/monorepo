---
'@kestack/web-platform': patch
'@kestack/kabuki': patch
---

The Web Platform is for apps on Kabuki Start only. `pwa()` builds its worker
beside Start's client and Worker, with no prerender: the presets save each
page visited per Build ID and send the rest to the app's own
`public/offline.html`, and while an update waits a saved page answers, so
every page stays on one build. `PwaHead` and `Pwa` put the PWA in a Kabuki
Start Document; `pwaRoot` is gone. The TanStack Start parts are gone too:
`createApp` (the root door), `./define`, `./client`'s `webRoot`, and
`./server`'s `createServer`, `liveObject` and `webServer`, and
`./client/server`'s `getTheme`; `./server` keeps the stage helpers. The Web Platform's Document draws the viewport under
the notch and home bar, with the keyboard shrinking the page, through
`Start.Head`'s new `viewport`.

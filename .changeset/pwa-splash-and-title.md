---
'@kestack/web-platform': patch
---

`pwa({ splash: true })` puts the iOS startup images in the head, one per screen `splashScreens` lists, with the `apple-mobile-web-app-capable` iOS shows them only with; it is off by default. Every PWA's head now titles its home-screen icon with `apple-mobile-web-app-title`, the manifest's `short_name`, else its `name`. `@kestack/web-platform/pwa/splash` gives `splashHead` and `splashScreens` alone, for a script that draws the images.

---
'@kestack/web-platform': patch
---

The PWA no longer goes by `pwa-toolkit`. Its caches start with `web-platform:pwa:`, and a new version deletes the ones under the former name as it activates, as the Kill Switch does. Its meta tags are `web-platform:build-id`, `web-platform:built-at` and `web-platform:commit`, its Vite plugins `@kestack/web-platform:pwa-*`, and its messages start with `web-platform/pwa:`. The Install Prompt's dismissal is kept under a new key, so someone who dismissed it is asked once more. Only the Command's key keeps the old name, since a page of an older build still sends it.

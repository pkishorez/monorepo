---
'@kestack/web-platform': patch
---

A page the service worker already saved is checked against the server build too. A deploy that changes no asset keeps the Build ID, so the new worker installs into the last install's Precache; before, it kept every page found there, a stale one included, and the home page stayed unstyled after the fix for saving stale pages shipped.

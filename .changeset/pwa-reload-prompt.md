---
'@kestack/web-platform': patch
---

An app that finds it is older than what it talks to now asks the reader to reload, instead of reloading on its own, and "Check for updates" waits for what it finds.

**Added**

- The Reload Prompt: `updateToNewest()` opens a dialog `Pwa` draws, "<app name> was updated", with one Reload button and no way to dismiss it. Reload applies the newer build if it is downloaded, else checks every 12 seconds until it is, then every open page reloads into it; after two minutes it says the new version is still rolling out. With no service worker, as in development or a `noPwa()` build, Reload reloads the page. `ReloadPrompt` is exported for an app that draws its own `PwaProvider`.

**Changed**

- `updateToNewest()` no longer reloads by itself: it opens the Reload Prompt, once per page load.
- `checkForUpdate` resolves only once a newer build that started installing is downloaded, or failed, or after 60 seconds, and resolves with whether one is waiting. Before, it resolved as soon as the download began, so a page said it was up to date seconds before the Update Prompt appeared. Checks asked for at once share one.
- The page checks for a newer build every 5 minutes by default, down from 60.

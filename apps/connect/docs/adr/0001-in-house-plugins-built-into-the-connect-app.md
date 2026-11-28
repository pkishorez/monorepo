# In-house Plugins only, their UIs built into the Connect App

Every Plugin is ours; there are no third-party Plugins. So a Plugin's UI is
not loaded at run time from a file of its own: the Connect App imports each
Plugin's UI lazily, and one Vite build of the App splits, shares and
tree-shakes their code and compiles one Tailwind stylesheet for all of them.
This replaces the `connect-plugins` POC, which fetched each Plugin's
`ui.mjs`, `ui.tailwind.css` and `ui.classes.json` and compiled the page's
stylesheet in the browser, and which only third-party Plugins needed.

## Consequences

- A Plugin's UI changes only with a deploy of the App.
- No Plugin runs code we did not write, so the App does not isolate one
  Plugin's UI from another's or from the App.
- Opening Connect to third-party Plugins later is a new decision, not a
  setting: it brings back loading at run time, and isolation with it.
- A Plugin's Plugin Server, its API and MCP, still ships as its own Release
  through Connect Cloud's Catalog, which each Computer downloads on its
  Heartbeat. So the App and the Catalog are deployed together, and
  `ke-connect` itself rarely needs an update.

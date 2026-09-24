# Snapshots render the bundled page in a headless browser, without a server

**Status:** accepted

`devtools snapshot` draws a Project's changed Modules to a PNG by opening the
bundled Snapshot page in headless Chromium through `playwright-core`. The page
and its assets are served to the browser from `dist/ui` through a request
route, the Snapshot Request is injected as a global before the page runs, and
the page flags an attribute once the drawing has settled. Nothing listens on a
port, and the picture is drawn by the same React Flow layout and components
the interactive Laymos Tool uses.

A pull request wants a picture of what changed, made by a CI job with no
browser session and no DevTools Server. Drawing it with the interactive UI's
own code keeps one renderer: the picture is exactly what a developer sees in
DevTools, and every visual change to the Module graph reaches both.

## Considered options

- **Start the DevTools Server and screenshot `/laymos`.** Rejected: the
  server needs a database, a port, and a registered Project, and the Tool's
  chrome (toolbars, panels, controls) would have to be hidden for a capture.
- **Emit SVG from the pure layout in Node.** Rejected for now: the layout is
  pure, but every style lives in the React components, so an SVG emitter
  duplicates them and drifts. It stays possible if a browser in CI proves too
  costly.
- **A Mermaid block in the description.** Rejected: GitHub renders it with no
  browser, but it is not the Laymos drawing.

## Consequences

- `playwright-core` is an optional peer dependency; the command explains what
  to install when it or a browser is missing, and other subcommands never
  load it.
- The Snapshot page is a second Vite entry, `snapshot.html`, built beside the
  application and served by the same `dist/ui` folder.
- The picture's size is decided in the page from the drawn content and capped
  by the command's flags; the command reads the settled element's size and
  captures that element alone.
- Putting the picture in a pull request is left to the caller; the command
  only writes the PNG.

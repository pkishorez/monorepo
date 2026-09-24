---
'@pkishorez/devtools': patch
'kui-toolkit': patch
---

Add `devtools snapshot`: it analyzes one Laymos Project, marks what its commits changed since a Base ref (default `main`; uncommitted work is left out), and draws the changed Modules and their Layers to a PNG in headless Chromium through the optional peer `playwright-core`, without starting a server. The bundled Snapshot page is a second entry beside the application; the picture is sized to its content and capped by `--max-width` and `--max-height`, and drawn dark unless `--theme light` or `DEVTOOLS_THEME=light` is given. `kui-toolkit` gains `ArchitectureSnapshot`, the still Module graph the page draws, `ModuleGraph` gains a non-interactive mode with an `onFitted` callback, and the changes-only filter of the workspace is shared as `changedArchitecture`.

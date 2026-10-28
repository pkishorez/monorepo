---
'@kestack/devtools': patch
---

`devtools` installs as one minified file. Its only dependencies are `oxc-parser`, `oxc-resolver` and `tsx`, which can't be bundled. The npm package is only the CLI and its UI: the `./lotel` exports are left out.

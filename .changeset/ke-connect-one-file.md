---
'@kestack/connect': patch
---

`ke-connect` installs as one minified file with no dependencies, so it never pulls in mismatched kestack packages. The npm package is only the CLI: the code Plugin, which Connect downloads, and the library exports are left out.

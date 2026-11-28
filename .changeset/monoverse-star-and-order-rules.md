---
'@kestack/monoverse': patch
---

Two oxlint rules on how files import and export, on for every package.

**Added**

- `monoverse/no-star`: reports `import * as` and `export *` of the package's own files (paths starting with `.`, `/` or `#`). An import from a package, such as `@alchemy.run/cloudflare`, is not judged. `export * as Name` is an exception a line turns off with its reason.
- `monoverse/values-before-types`: in an index file, every value export comes before every type export, and one statement does not mix the two.
- `rules` turns both on.

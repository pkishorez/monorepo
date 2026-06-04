# Guidelines

- Files: kebab-case only (no PascalCase or camelCase)
- Comments: only when absolutely necessary; code should be self-explanatory. Exception: JSDoc comments for functions, classes, and complex data structures.

# Reference repos

- `repos/effect-smol` is a vendored copy of [Effect-TS/effect-smol](https://github.com/Effect-TS/effect-smol), added as a squashed git subtree. It is **read-only reference material** — read it to write idiomatic Effect code, but never edit it or import from it. Update it with:
  ```bash
  git subtree pull --prefix=repos/effect-smol https://github.com/Effect-TS/effect-smol.git main --squash
  ```

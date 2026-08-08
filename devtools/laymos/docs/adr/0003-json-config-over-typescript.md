# Configuration is a plain `laymos.config.json`, not a typed `laymos.config.ts`

Project configuration (source roots, layers, layerGraphs) is declared in
`laymos.config.json`, a plain JSON file validated against a published JSON
Schema via a `"$schema"` key — not the `defineConfig`/`layer`/`layerGraph`
TypeScript API originally documented in `README.md`. The schema is generated
from the config service's Effect Schema and published alongside the `laymos`
npm package (e.g. `https://unpkg.com/laymos/schema.json`), so editors get
autocomplete/validation without any local dependency.

The driving requirement: a separate devtools-server project needs to read and
render a project's full architecture purely from its config file, without
depending on the `laymos` package even as a devDependency. A `.ts` config can
express things JSON can't (computed values, functions), but everything laymos
needs — layers as disjoint path groups, layerGraphs as named rule sets — is
static data, so the extra expressiveness isn't needed and its cost (a required
dependency, a module the devtools-server would need to execute) isn't worth
paying. The trade-off given up is compile-time type checking and IDE
refactoring support (rename-symbol, go-to-definition) on layer references,
which the `$schema`-driven editor validation only partially replaces.

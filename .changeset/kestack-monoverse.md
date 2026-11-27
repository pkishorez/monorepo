---
'@kestack/monoverse': patch
---

A new package: the folder rules a package's `monoverse.json` names, checked by the `monoverse lint` CLI and by DevTools' Monoverse, with one engine.

**Added**

- `monoverse.json`, beside a package's `package.json`: `sourceRoots`, the folders checked; `ignore`, the files skipped; either a `preset`, `"default"` or `"kabuki"`, or the package's own `rules`; and, beside either, `exceptions` and `restrictions`, each a `from` glob, a `to` glob and a `reason`. A package without one is not checked. Its JSON Schema ships as `@kestack/monoverse/schema.json`.
- The imports rule: a file imports any file in its own module, the index file of any module below it, at any depth, or, beside or above it, only a door's index file. Imports are followed as TypeScript and Node follow them: relative paths, tsconfig `paths`, package.json `imports` and a package naming itself. A tsconfig that cannot be read, such as one extending a package not installed, is passed over rather than losing every import below it. Any import that lands on a file of the same package is judged; one into another package, nested ones included, is not.
- The contracts rule: the contract folders it requires exist, and a contract exports only `Context.Service` and error classes as values, everything else as types.
- `exceptions` let an import the imports rule refuses through; `restrictions` refuse more, by path or by package name (`"react"` covers `react/jsx-runtime`), and no exception lifts one. An exception that lets nothing through, a restriction that covers no checked file, and a broken `monoverse.json` are each told once, on the `monoverse.json`.
- `monoverse lint [--staged]`: inside a package, checks that package; elsewhere in a repository, every workspace package with a `monoverse.json`; with `--staged`, only those holding a staged file. Prints `path:line:col  message` grouped by package, and exits 1 on any problem.
- `@kestack/monoverse`: `openProject` and `checkProject`, the same check for a tool that knows a folder and its files, with each file's resolved imports from the same parse; `parseConfig`, `presets`, `isChecked`, `matches`, and the folder helpers.

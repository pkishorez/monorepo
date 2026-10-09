# Laymos is reached through Monoverse

**Status:** accepted

DevTools shows Laymos only as Embedded Laymos inside Monoverse; there is no
Laymos Tool, `/laymos` route, or Laymos list in the Project registry. Since
Monoverse also takes a Single Package, a folder with a `package.json` that
lists no workspace packages, every Laymos Project is in practice reachable
that way: every real `laymos.config.json` in this repository sits at a
package root, either a Package of a Monorepo or a Single Package of its own.

## Considered options

- **Keep a separate Laymos Tool beside Monoverse.** Rejected: it is two ways
  in to the same view, each with its own list of folders to keep in step.

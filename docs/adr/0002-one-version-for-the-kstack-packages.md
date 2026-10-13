# One version for all kstack packages

Status: narrowed by [ADR 0008](0008-one-version-for-the-packages-that-depend-on-each-other.md): only the packages that depend on another package in the repo share the one version; the rest version alone.

Every `@kestack/*` package and `laymos` sit in one changeset `fixed` group, so they always release together under one version number, the way Effect versions its packages. Users follow one rule: keep all kstack packages on the same version. `use-effect-ts` depends on nothing in the repo and keeps its own version.

## Considered Options

- **Every package versioned on its own**: rejected. Internal links are exact pins while versions are 0.0.x, so a change still releases every dependent, and users have to work out which versions go together.
- **Two groups, devtools and toolkits**: rejected. The groups depend on each other (lotel and devtools on std-toolkit, ui-toolkit on flow, lotel, effect-tracer and laymos), so a patch in either group released all twelve packages anyway, just under two numbers.

## Consequences

Every release republishes all fifteen packages, including ones that did not change. Packages that apps use alongside each other are peer dependencies (optional when only some entry points need them), so an app keeps one copy of each.

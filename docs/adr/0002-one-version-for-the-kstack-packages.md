# One version for all kstack packages

Status: amended by [ADR 0006](0006-platforms-may-break-toolkits-keep-what-persists.md) and [ADR 0007](0007-web-is-the-only-platform.md): the Web Platform keeps its own version.

Every `@kstackz/*` package and `laymos` sit in one changeset `fixed` group, so they always release together under one version number, the way Effect versions its packages. Users follow one rule: keep all kstack packages on the same version. `use-effect-ts` depends on nothing in the repo and keeps its own version.

## Considered Options

- **Every package versioned on its own**: rejected. Internal links are exact pins while versions are 0.0.x, so a change still releases every dependent, and users have to work out which versions go together.
- **Two groups, devtools and toolkits**: rejected. The groups depend on each other (lotel and devtools on std-toolkit, ui-toolkit on flow, lotel, effect-tracer and laymos), so a patch in either group released all twelve packages anyway, just under two numbers.

## Consequences

Every release republishes all fifteen packages, including ones that did not change. Packages that apps use alongside each other are peer dependencies (optional when only some entry points need them), so an app keeps one copy of each.

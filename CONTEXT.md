# Monorepo

Published packages for building full-stack Effect apps under the kstack umbrella, designed to work together.

## Language

**kstack**:
The umbrella name for the packages in this repo that make up one stack, published under the `@kstackz` npm scope.
_Avoid_: brand, kstackz (as a name), pkishorez packages

**Toolkit**:
A kstack package covering one area of an app (data, UI, AI, PWA, RPC, auth), named `@kstackz/<area>-toolkit`.
_Avoid_: kai-toolkit, kui-toolkit, unscoped toolkit names

**Stand-alone tool**:
A package from this repo that is useful without kstack and keeps its own unscoped name, such as `laymos` or `use-effect-ts`.

**Re-export package**:
A package that depends on every Toolkit and only re-exports them. Considered and rejected for kstack.
_Avoid_: umbrella package, meta-package

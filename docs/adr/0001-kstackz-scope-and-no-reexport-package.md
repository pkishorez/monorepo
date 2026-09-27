# Publish the kstack umbrella under `@kstackz`, with no re-export package

kstack is the umbrella name for this repo's stack. The `@kstack` npm org belongs to someone else, so the packages publish under `@kstackz`. Toolkits keep the `-toolkit` suffix (`@kstackz/std-toolkit`, `@kstackz/ui-toolkit`, `@kstackz/ai-toolkit`, `@kstackz/pwa-toolkit`, `@kstackz/rpc-toolkit`, `@kstackz/auth-toolkit`) so they stand apart from the other kstack packages (`@kstackz/flow`, `@kstackz/lotel`, `@kstackz/effect-tracer`, `@kstackz/devtools`, `@kstackz/effect-webrtc`). Stand-alone tools that are useful without kstack (`laymos`, `use-effect-ts`) keep their own unscoped names.

## Considered Options

- **`@pkishorez/<area>-toolkit`**: rejected because it names a person rather than the umbrella.
- **Short names such as `@kstackz/std`**: rejected because they hide which packages are Toolkits.
- **A re-export package `kstack` that depends on every Toolkit**: rejected. It combines the costs of one package (a large install, one shared version) with the costs of many (a generated re-export layer, more to publish, and duplicate Toolkit copies when a user also installs a Toolkit directly). The `kstack` name stays reserved in case the stack later ships as one real package, the way Effect v4 merged its packages into `effect`.

## Consequences

Users and AI agents will sometimes guess `@kstack/*`, which is someone else's scope. Docs should always spell out `@kstackz`.

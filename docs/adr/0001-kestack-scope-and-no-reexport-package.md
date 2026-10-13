# Publish the kstack umbrella under `@kestack`, with no re-export package

Amended: the packages first published under `@kstackz` and moved to `@kestack` once that scope was ours. ui-toolkit and pwa-toolkit later merged into `@kestack/web-platform` ([ADR 0003](0003-web-toolkit-and-the-gate.md)), and `@kestack/flow` and `@kestack/expo-platform` were removed ([ADR 0007](0007-web-is-the-only-platform.md)). The lists below are the packages as they were then.

kstack is the umbrella name for this repo's stack. The `@kstack` npm org belongs to someone else, so the packages publish under `@kestack`. Toolkits keep the `-toolkit` suffix (`@kestack/std-toolkit`, `@kestack/ui-toolkit`, `@kestack/ai-toolkit`, `@kestack/pwa-toolkit`, `@kestack/rpc-toolkit`, `@kestack/auth-toolkit`, `@kestack/expo-platform`) so they stand apart from the other kstack packages (`@kestack/flow`, `@kestack/lotel`, `@kestack/effect-tracer`, `@kestack/devtools`, `@kestack/effect-webrtc`). Stand-alone tools that are useful without kstack (`laymos`, `use-effect-ts`) keep their own unscoped names.

## Considered Options

- **`@pkishorez/<area>-toolkit`**: rejected because it names a person rather than the umbrella.
- **Short names such as `@kestack/std`**: rejected because they hide which packages are Toolkits.
- **A re-export package `kstack` that depends on every Toolkit**: rejected. It combines the costs of one package (a large install, one shared version) with the costs of many (a generated re-export layer, more to publish, and duplicate Toolkit copies when a user also installs a Toolkit directly). The `kstack` name stays reserved in case the stack later ships as one real package, the way Effect v4 merged its packages into `effect`.

## Consequences

Users and AI agents will sometimes guess `@kstack/*`, which is someone else's scope. Docs should always spell out `@kestack`.

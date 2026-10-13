# One version for the packages that depend on each other; the rest version alone

Status: accepted. Narrows [ADR 0002](0002-one-version-for-the-kstack-packages.md), and supersedes the version half of [ADR 0006](0006-platforms-may-break-toolkits-keep-what-persists.md).

A package joins the changeset `fixed` group when it depends on another package in this repo, as a dependency or a peer. Today that is ai-toolkit, auth-toolkit, rpc-toolkit, std-toolkit, the Web Platform, devtools, lotel, laymos and effect-webrtc: they always release together under one version, and an app keeps them on the same one. A package that depends on nothing in the repo versions on its own: `@kstackz/kabuki`, `@kstackz/use-gesture`, `@kstackz/use-keys`, `@kstackz/effect-tracer` and `use-effect-ts`. A package moves into the group the day it starts depending on one inside it.

While everything is on `0.0.x`, any change can break any dependent, so a package that reads another is released with it rather than trusted to a range. A package that reads nothing in the repo cannot be broken by it, and its own version then says when it changed.

## Considered Options

- **Every `@kstackz` package and `laymos` in one version (ADR 0002)**: rejected for the standalone packages. @kstackz/kabuki, use-gesture, use-keys and effect-tracer republished with every toolkit release though nothing in them changed, and their version numbers stopped meaning anything.
- **Only the toolkits and the Web Platform in one version, devtools on its own**: rejected. devtools, lotel and laymos read std-toolkit or each other, and on `0.0.x` a std-toolkit change can break them as easily as it breaks a toolkit.
- **The Web Platform on its own version (ADR 0006)**: rejected. It lists the toolkits as exact peers, so every toolkit release republished it anyway, and an app had to work out which version went with which.

## Consequences

- A release of a standalone package still patches every package in the group that lists it, at an exact `0.0.x` version: the Web Platform lists @kstackz/kabuki, use-gesture, use-keys and use-effect-ts as peers, and laymos depends on effect-tracer. Changesets makes those bumps patches, never majors.
- Each changeset still names the package that changed and what an app does about it.

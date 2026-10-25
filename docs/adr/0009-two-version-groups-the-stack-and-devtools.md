# Two version groups: the stack and DevTools

Status: accepted. Narrows [ADR 0008](0008-one-version-for-the-packages-that-depend-on-each-other.md).

Status: amended by [ADR 0011](0011-ai-toolkit-stops-at-the-harness-connect-owns-the-rest.md): @kestack/connect joins the stack group.

The changeset `fixed` config holds two groups instead of one.

- **The stack**: ai-toolkit, auth-toolkit, rpc-toolkit, std-toolkit and the Web Platform. They read each other, and an app installs them together, so they release under one version. They start at `0.0.1`.
- **DevTools**: `@kestack/devtools`, `@kestack/effect-tracer` and `laymos`. devtools runs laymos and effect-tracer and reads their shapes, and laymos depends on effect-tracer, so a change in one is a release of all three. They continue from laymos's version.

kabuki, use-gesture, use-keys and `use-effect-ts` depend on nothing in the repo and keep their own versions.

ADR 0008's rule still holds inside each group: a package joins the group whose packages it reads. The groups are split because an app installs the stack and a developer installs DevTools; one shared number made a toolkit release look like a DevTools release, and carried laymos's history onto toolkits that had never shipped.

## Considered Options

- **One group for everything that reads another package (ADR 0008)**: rejected. The toolkits would start at laymos's `0.0.12` and every DevTools release would bump them.
- **effect-tracer on its own version**: rejected. laymos depends on it and devtools reads its shapes, so its releases always move them.

## Consequences

- The groups still touch at the edges. devtools depends on std-toolkit and lists the Web Platform as a devDependency, and the Web Platform lists laymos as an optional peer. A release in one group therefore patches the other group's packages that list it, as a patch at an exact `0.0.x` version.
- A standalone package's release still patches the Web Platform, which lists kabuki, use-gesture, use-keys and use-effect-ts as peers.

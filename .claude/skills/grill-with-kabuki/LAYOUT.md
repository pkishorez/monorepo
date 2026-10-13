# The Actor folder

How a Kabuki tree is laid out on disk. Every Actor is one folder, named
for it in kebab-case, and every Child is a folder nested inside its parent's,
so the folder tree is the Actor tree. Each Actor folder is a Laymos Module.

```
launchpad/
  index.ts          export const Launchpad = { actor: LaunchpadActor, view: LaunchpadView }
  launchpad.ts      the Actor: Schemas, Requires, and build; exports LaunchpadActor
  view.tsx          View.make(LaunchpadActor, …); exports LaunchpadView
  capabilities/     what Launchpad Provides, one file per Capability
    index.ts
    hangar.ts       export class Hangar extends Context.Service<…>()('<app>/launchpad/Hangar') {}
    weather.ts
  rocket/           a Child: the same shape, one level down
    index.ts
    rocket.ts       imports '../capabilities/index.js' for what it Requires
    view.tsx
    engine/         a grandchild
```

## Files

- `<name>.ts` holds the Actor: `Actor.make` with its Schemas and Requires,
  then `build`. Schemas and the pure logic of the Updates live here; nothing
  is split out by kind.
- `view.tsx` holds the View, `View.make(<Name>Actor, draw)`. A parent's View
  places a Child with `<Rocket.view instance={children.rockets} />`.
- `index.ts` exports one object, `<Name>`, with `actor` and `view`. A parent
  reaches its Child's Actor as `Rocket.actor` in `children`. Nothing else
  leaves the folder through `index.ts`: never a Capability.
- `capabilities/` exists only when the Actor Provides something. One file per
  Capability, named for it, exporting a bare name (`Hangar`, not
  `LaunchpadHangar`); the Context key carries the path. The Actor's own
  `provides` builds its Layers from this folder.

## Capabilities and the import direction

A Capability lives under the Actor that Provides it, in `capabilities/`.
That folder is a Nested Module: the parent's own files import it for free,
and a Child imports it as a sibling, which Laymos allows by Rule and never by
Exception. Importing the parent's `index.ts` from a Child is the Exception
to avoid, and the layout makes it unnecessary.

One Rule per Child whose subtree Requires something from the parent, from the
Child's folder to the parent's `capabilities/`:

```json
"rules": {
  "src/launchpad/rocket": ["src/launchpad/capabilities"]
}
```

A Rule from the Child's folder covers every Module inside it, so a
grandchild's need bubbles through the same Rule.

Capabilities nothing in the tree Provides, which the app's Layer gives to
`toReact`, take the same shape one level up: a `capabilities/` Module beside
the root Actor's folder, a Rule from the root's folder to it, and the Layer
built in the app's entry file.

```
src/
  capabilities/     what the app Layer Provides: Server, Clock, …
  launchpad/        the root Actor
  main.tsx          toReact(Launchpad.actor, Launchpad.view, AppLayer)
```

```json
"rules": {
  "src/launchpad": ["src/capabilities"],
  "src/launchpad/rocket": ["src/launchpad/capabilities"]
}
```

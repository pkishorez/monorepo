# An Actor is a folder, and Capabilities sit under their Provider

A Kabuki app is laid out as one folder per Actor, each Child's folder nested inside its parent's, so the folder tree is the Actor tree and each folder is a Laymos Module. A folder's `index.ts` exports one object, `<Name>`, with `actor` and `view`, and nothing else. The Capabilities an Actor Provides live in a `capabilities/` Nested Module inside its folder, one file per Capability under a bare name; a Child reaches that folder as a sibling, under one Laymos Rule from the Child's folder, which also covers every descendant whose need bubbles up through it. Capabilities the app Layer gives live in a `capabilities/` Module beside the root Actor's folder. The `grill-with-kabuki` skill models and builds apps in this shape.

## Considered Options

- **The Capability definitions in the parent's own files, exported through its `index.ts`**: rejected. A Child importing its parent is the one import Laymos only ever allows as an Exception, and every Child would need one.
- **The Capability with the Child that Requires it, re-exported up every `index.ts` until an ancestor Provides it**: rejected. Ownership is the Provider's; a Capability two Children share would have no home, and every index on the way up would re-export things it does not use.
- **All Capabilities of the app in one folder beside the root**: rejected for what an Actor Provides. The folder would say nothing about who Provides what, and a Rule to it would grant every Actor every Capability.
- **Separate exports `LaunchpadActor` and `LaunchpadView` from `index.ts`**: rejected for now. One object keeps the Actor and its View as one thing to place; tree shaking is not a concern without a server side.

## Consequences

- A Child may import only its own folder, its own Children's indexes, and the `capabilities/` folders of its ancestors that a Rule names. `laymos lint` proves nothing points upward.
- The Laymos config grows one Rule per Child that Requires something from above, written as the tree is built.
- A Capability's file says who Provides it by where it sits, so its export name is bare and its Context key carries the path.

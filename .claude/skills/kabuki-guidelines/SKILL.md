---
name: kabuki-guidelines
description: The rigid folder, file, naming and import rules for every Actor in a Kabuki app in this monorepo, and the plan → build → review → verify loop each change goes through. Use before writing, moving, or reviewing code in a Kabuki app (DevTools first), before opening a PR for one, and when a reviewer or the user corrects a repeated mistake.
---

# Kabuki guidelines

An Actor folder has a fixed shape. Every name in it is given, so there is
nothing to invent. If a thing has no place below, stop and ask; do not
make a new folder or file name.

Vocabulary (Actor, Shape, Model, State, Message, Command, Worker, Query,
Child, Capability, Input, Props, Emit) is in
[packages/kabuki/README.md](../../../packages/kabuki/README.md).

## Every folder is private

A folder with an `index.ts` is a **module**. Code is shared only through a
few named folders, the **doors**. A file may import:

1. **its own module**: any file in it;
2. **below it**: the `index.ts` of any module beneath it, at any depth;
3. **beside or above it**: only a door's barrel, `<door>/index.ts` or
   `<door>/<name>/index.ts`.

```
        ┌─────────── above me and beside me ───────────┐
        │  only doors: shared/ and contract/ barrels   │
        └──────────────────────┬───────────────────────┘
                               ▼
                           [ me ]          my own module: anything
                               ▼
        ┌──────────────────── below me ────────────────┐
        │  any module's barrel (its index.ts)          │
        └──────────────────────────────────────────────┘
```

| Door                                             | Holds                                           |
| ------------------------------------------------ | ----------------------------------------------- |
| `logic/shared/`                                  | the Shape, and pure logic shared down           |
| `view/shared/`                                   | pure components shared down                     |
| `children/shared/`                               | Actors that several Actors below place          |
| `capabilities/*/contract/`                       | a Context.Service the Actor provides            |
| `services/*/contract/`                           | a Context.Service the app or a feature offers   |
| `server/rpc/contract/`, `server/rpc/*/contract/` | what a feature's browser and server agree on    |
| `http/*/contract/`                               | a server's non-RPC routes, for that server only |

A door is open to everything inside the folder that holds it:
`actor-tree/logic/shared/` is open to all of `actor-tree/`, its `view/`
and its Children alike. `monoverse lint` from
[@kestack/monoverse](../../../devtools/monoverse/README.md) checks all of
this in every package whose `monoverse.json` sets `"preset": "kabuki"`;
the files its `ignore` names, such as tests, are skipped.

## The app

```
src/
├── actor-app/       the root Actor
├── services/        contracts every Actor in the app may use
└── kabuki/          one folder per feature, named for it
```

Nothing else sits in `src/` except the entry file, which holds the app's
Layer.

## A feature

A feature is a part of the app with its own Actor tree, such as a DevTools
Tool. Everything that only this feature uses lives in its folder:

```
monoverse/
├── actor-monoverse/   its root Actor, in the shape below
├── services/          Effect contracts its Actors use, in the shape of capabilities/
└── server/            its server half, when it has one
```

- The app mounts the root Actor through `actor-monoverse/index.ts`.
- The app's Layer builds the feature's services from `services/*/real/`.
- The server's host imports `server/index.ts`.
- The browser half reaches the server only through its RPC contracts.
- Anything two features both use moves up to the app's `services/` or
  into a package.

### The server

Every unit of a server is a folder with a `contract/` and a `real/`:

```
server/
├── index.ts             the host's door: the server Layer and its endpoints
├── rpc/
│   ├── contract/        door: every group merged, the RPC path, and the pure
│   │                    functions both halves run (when there is more than one group)
│   └── project/         one RpcGroup, with the RPCs of one topic
│       ├── contract/      door: the RpcGroup, its Schemas and errors
│       ├── real/          group.toLayer(…): the handlers and their helpers, free-form
│       └── tests/
├── http/
│   └── otlp/            one HttpApi group, for routes that are not RPC
│       ├── contract/      door for the server: the endpoints and their Schemas
│       ├── real/          the handlers Layer
│       └── tests/
├── services/
│   └── snapshots/       one Context.Service the handlers share, in the shape of capabilities/
└── tests/               the server end to end
```

- A handler's helpers live in its group's `real/`. What several groups need
  and does IO becomes a `services/<name>/`; what both halves run and is
  pure goes in `rpc/contract/`.
- An RPC contract imports only packages, its own files and other RPC
  contracts. Inside a `real/`, sub-folders have no `index.ts`: a `real/` is
  one module.
- `server/index.ts` merges every group's `real/` and every service's `real/`.
- A server Service is keyed `'<Root>/server/<Name>'`: `'Monoverse/server/Snapshots'`.

`services/` and `capabilities/` are Effect contexts: a `Context.Service`
and the Layers that implement it. `rpc/` and `http/` are a wire format:
what crosses the network, and the handlers behind it. Never mix the two.

## One Actor

```
actor-folder-viewer/
├── index.ts         FolderViewer, FolderViewerView, the selectors its parent reads, and a few types
├── actor.tsx        wires the parts together; decides nothing
├── logic/
│   ├── index.ts       what actor.tsx needs: the Shape, init, updates, workers, queries
│   ├── shared/        door: what view/, capabilities/ and the Children read
│   │   ├── index.ts
│   │   ├── shape.ts     Actor.define, every Schema, the type aliases other files name (required)
│   │   └── selectors.ts pure reads of its data
│   ├── updates.ts     init, and one pure function per Message, with their private helpers
│   ├── commands.ts    Commands
│   ├── workers.ts     Workers
│   └── queries.ts     answers to its Queries
├── view/
│   ├── index.ts       exports the body, nothing else
│   ├── view.tsx       the body: one pure component that lays out the Actor and its Children's slots
│   ├── shared/        door: pure components its descendants may use
│   └── …              free-form, one component per file
├── capabilities/
│   └── selection/     one folder per contract it Provides
│       ├── contract/    door: one Context.Service, Selection; absent when a package owns it
│       ├── real/        the Layer built from the Actor's self
│       └── …            fake/ and any other implementation, free-form, all optional
├── children/
│   ├── actor-file-viewer/   a Child only this Actor places, in the same shape
│   └── shared/              door: Actors that several Actors below this one place
└── tests/           named for what they test: logic.test.ts, view.test.tsx, actor.test.ts
```

Only `index.ts`, `actor.tsx` and `logic/shared/shape.ts` are required. The
rest appear when needed; `logic/index.ts` only when `logic/` holds more
than `shared/`. `services/` has the same shape as `capabilities/`, in the
app and in a feature alike.

### Where a thing goes

| Thing                                       | Place                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------- |
| A sub-Schema, a type                        | `logic/shared/shape.ts`                                               |
| A constant                                  | the one file that uses it; used by two, `logic/shared/shape.ts`       |
| An error                                    | a contract; inside an Actor a failure becomes a Message               |
| A Child's input, props, emits               | a one-liner in `actor.tsx`; one that computes calls a selector        |
| What `view/` reads of the data              | `logic/shared/`                                                       |
| A Capability's implementation               | `capabilities/<name>/real/`                                           |
| Pure logic or a component used further down | `logic/shared/` or `view/shared/` of the lowest Actor above its users |
| An Actor several Actors place               | `children/shared/` of the lowest Actor above all of them              |
| What a feature's browser and server share   | the RPC group's `contract/`, or `server/rpc/contract/`                |
| The app's component library                 | the root Actor's `view/shared/`                                       |

Put a thing in a door only when it has a second user, never in case one
turns up. Put it in the door of the lowest folder above all its users, and
move it down again when a user goes. A door item is small and generic: if
it speaks one user's words, it belongs to that user.

A file keeps its own private helpers. Never split one out only to make a
file smaller, and never make a file for one line: a pass-through one-liner
is written where it is used. A file that grows too big becomes a folder of
the same name: its `index.ts` exports exactly what the file did, and its
inside is free-form. Example: `updates.ts` → `updates/index.ts`.

### Types

Type every part written outside `build` from the Shape. Never write these
types by hand:

| Part                         | Type                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `init`                       | `InitOf<typeof FolderViewerShape>`                                       |
| `updates`                    | `UpdatesOf<typeof FolderViewerShape>`                                    |
| `workers`                    | `WorkersOf<typeof FolderViewerShape>`                                    |
| a selector's argument        | `DataOf<typeof FolderViewerShape>`, or `DataOf<…, 'Open'>` for one State |
| a Capability's `real/` Layer | `(self: SelfOf<typeof FolderViewerShape>) => Layer`                      |
| the body's props             | `ViewPropsOf<typeof FolderViewerShape> & { fileViewer: ReactNode }`      |

`ViewPropsOf` comes from `@kestack/kabuki/react/types`; the others come
from `@kestack/kabuki/types`. `shape.ts` names a type only when another
file needs it, such as the State union or a literal. A Child never names
its parent's Shape: what it needs from its parent comes as Input or Props.

### `actor.tsx`

```tsx
export const FolderViewer = FolderViewerShape.build({
  init,
  on: updates,
  workers,
  children: { fileViewer: Actor.child(FileViewer, { … }) },
});

export const FolderViewerView = View.make(FolderViewer, (self) => (
  <Body {...self} fileViewer={<FileViewerView instance={self.children.fileViewer} />} />
));
```

The body in `view/view.tsx` gets each Child's View as a slot, and it does
the orchestration: what shows where, and when. It never imports a Child.

`actor.tsx` decides nothing. It may hold only wiring:

- one-liners that pass data through unchanged, such as an `init` that
  copies its Input, or a Child's input that picks fields;
- for a Child that exists in only one State, the `self._tag === '…'` check
  that gives its slot, or `null`;
- a figure the parent shows from a Child's data, read in the View with
  `useChild(self.children.feed, listedCount)` and handed to the body as a
  prop. The selector belongs to the Child, which exports it from its
  `index.ts` and types it with its own Shape. It returns a plain value,
  such as a number or a string, so the View redraws only when that value
  changes. The parent never writes a type for a Child's data.

Anything that branches on data or computes belongs in `logic/`.

## Rules

`monoverse lint` checks rules 2 and 3, and the first half of 4 where the
package's `monoverse.json` restricts `logic/` from `react`, as DevTools'
does; the rest are for review.

1. **Closed folders.** Each folder holds only its listed names. Only the
   inside of `view/` and the implementations beside a `contract/` are
   free-form.
2. **Every folder is private.** Imports follow the three cases at the top:
   own module, any barrel below, a door beside or above.
3. **Contracts are contexts.** A `capabilities/*/contract/` or
   `services/*/contract/` exports one `Context.Service` as a value, named
   for its folder (`selection/` → `Selection`), the errors it fails with
   as values, and everything else as types. Every `services/<name>/` has
   its `contract/`. A Capability is keyed
   `'FolderViewer/capability/Selection'`; a Service `'<Root>/service/<Name>'`,
   where `<Root>` is the root Actor beside its `services/`:
   `'Kabuki/service/Sessions'`.
4. **Pure stays pure.** `logic/` imports no React. `view/` reads data only
   through `logic/shared/`.
5. **Names follow the folder.** `actor-folder-viewer` →
   `Actor.define('FolderViewer')` → `FolderViewerShape`, `FolderViewer`,
   `FolderViewerView`. Messages and Emits are past tense, States are
   nouns, Commands are lowercase verbs. No `Live` on an Actor.
6. **Three Children.** An Actor places at most three cohesive Children. A
   fourth needs a written reason. Independent ones, like Pages, may be
   more. A Child in `children/shared/` counts for each Actor that places
   it.
7. **Implementations stay home.** A Capability's `real/` is imported only
   by its `actor.tsx`; a Service's only by the app's Layer, or a server
   Service's by `server/index.ts`; a group's `real/` only by
   `server/index.ts`. Other implementations are imported only by tests.

## The loop

1. **Plan.** Place the work in the tree first: the Actor it extends, or
   the new `actor-*` folder it needs. Mark each piece as a Command, a
   Worker, or an Actor, the smallest that fits.
2. **Build.** Follow this file. Get lint, types and tests green before you
   stop. Never silence a check to pass it.
3. **Review.** A fresh subagent, given this skill and the diff (not your
   summary), audits each changed Actor folder, then each of its Children
   the same way, and reports in the format below.
4. **Verify.** Run the app and use the change as a user would. Write what
   you did and saw in the PR's `## Verification`.

When a mistake repeats, make a check catch it, in
[@kestack/monoverse](../../../devtools/monoverse/README.md), then shorten this file.

## Review output

```markdown
## kabuki-guidelines review: <what was reviewed>

**Verdict**: clean | <n> to fix

1. **Rule <n>** — `<file:line>`: <what breaks it, in one line>.
   Fix: <the smallest change that follows the rule>.
```

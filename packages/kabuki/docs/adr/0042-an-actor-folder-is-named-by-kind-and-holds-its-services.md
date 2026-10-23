# An Actor folder is named by kind, and holds its Services

Supersedes [ADR 0018](0018-an-actor-is-a-folder-and-capabilities-sit-under-their-provider.md), keeping its shape: one folder per Actor, Children nested inside, `capabilities/` as a nested Module under the Provider reached by one Laymos Rule per Child, and `index.ts` exporting one `<Name>` object. Three things change. A folder is named by its kind, `page-<name>` for a Page and `actor-<name>` for any other Actor, the root included, so that every folder inside an Actor folder that is not `capabilities/` or `services/` is known to be a Child from its name alone. The Actor's file is `actor.ts`, with `commands.ts` beside it only when it has Commands and `view.tsx` only when it has a View; the folder already carries the name, and one file name is greppable across every app. The implementation behind a Capability that wraps an outside thing, a table, an agent process, a socket, is a Service, kept in a `services/` nested Module of the Actor whose `provides` or Workers use it, lifted to the lowest Actor whose subtree holds every user; `capabilities/` holds keys only. The `kabukifi` skill models, records and builds apps in this shape, and `docs/kabuki-tree.md` in each app says what its tree is and why.

## Considered Options

- **`<name>/` with `<name>.ts`, as ADR 0018 had it**: rejected. A reader of `ls` could not tell a Child from a `capabilities/` folder without a convention they had to remember, and a Page looked like any other Actor.
- **Splitting `actor.ts` by kind into `messages.ts` and `workers.ts`**: rejected. A Worker is explained by the Condition that owns it, read from the Model; a Message by the Update that handles it. Apart, each file says nothing on its own.
- **Services beside the root only**: rejected. A Service used by one Actor deep in the tree would be reachable by every Actor, and the folder would not say who uses it.

## Consequences

- `grill-with-kabuki` is gone; `kabukifi` lives in the owner's skill library, not in this repo, so the convention holds for apps outside it.
- A Child never imports `services/`: what it needs from an ancestor's Service comes as a Capability.
- `ai-toolkit`'s engine and machine trees follow this shape, under `src/kabuki/`, with `docs/kabuki-tree.md` beside them. `apps/code` does not yet; `kabukifi` brings it into it, layout first and behaviour second.

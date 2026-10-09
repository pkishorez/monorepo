# Route transitions

Status: works. Loading on entry, reloading on a stay with a new id, saving on
exit and the transition log all behave as in Foldkit, and the log replays.

## What was ported

Foldkit's `route-transitions`: Home, a Gallery whose catalog loads on every
entry (600 ms), Painting pages that load (400 ms) on entry and again when the
id changes, a Studio whose draft is saved (300 ms) on leaving, and a log of
every route change with Cold load, Entered, Exited and Stayed badges.

```
RouteTransitions (root)      requires Location
  Model { path, log, draft, saved }
  Opening, Home
  Gallery                    └─ catalog: Catalog
  Painting { paintingId, ready }
  Studio                     Provides Drafts; └─ studio: Studio
  NotFound { path }
  every State: Lifetime heardUrl(model.path) → ChangedUrl
  ChangedUrl → next State, log entry, Commands: load painting / save draft
Catalog                      Loading → Ready (Lifetime: 600 ms)
  Ready: ClickedLink → Command: Location.push
Studio                       Model { text }
  Edited → Command: Drafts.edited(text)   (a Request: root's EditedDraft)
gallery/          paintings, Catalog, the Painting page
studio/           Studio and the Drafts Service it reports to
transition-log/   the log's Schema, `record`, and its drawing
```

## How Foldkit's Transition helpers map

Foldkit compares the previous and next route with `Transition.isEntering`,
`entered`, `exited`, `stayed` and `coldLoad`, all inside one `ChangedUrl`
handler. In Effect Oak each kind of change has its own home:

- **Entering** a page that owns work is a Child being created. The Catalog
  starts loading in its own Lifetime, and leaving mid-load destroys the load
  with it, so "only once per fresh entry" and "never twice at once" need no
  code at all.
- **Staying** (Painting 1 → Painting 2) is not a Transition: no Lifetime or
  Child restarts (ADR 0002). So the painting is loaded by a Command from the
  root's Update, which compares the old and new id, as Foldkit does.
- **Leaving** is an Update too: there are no exit actions, but Update is
  handed the State it leaves and returns the one it enters.
- **Cold load** is the `Opening` → first route Transition.

## Deviations

- **The Studio's draft is reported up at every edit.** Saving on exit is the
  root's job, but the Studio editor is a Child, and a parent cannot read a
  Child's Model. So each edit is two Messages: `Edited` in Studio, then
  `EditedDraft` in the root through the `Drafts` Request. Keeping the text
  only in the root's Model would save the Messages but leave no Child.
- **The editor starts empty on every visit.** Foldkit's textarea still holds
  the draft when you come back; a Child cannot be created with the root's
  draft (blocker 3). The last saved draft is shown below it, and the root
  clears its copy once saved so it is not saved twice.
- Hash paths and `Link`, as in [routing](../routing/notes.md).

## Blockers

- **No routing** (blocker 15): the same per-State Lifetime, `Opening`, and
  Time Travel not moving the address bar, as in routing.
- **Children cannot be given input when they are created** (blocker 3): the
  Studio editor cannot start from the root's draft.
- **A parent cannot read its Child's Model.** Work on leaving a State that
  needs a Child's data (save the draft) needs the Child to report every
  change up first. This is the other direction of blocker 13; a Child's last
  Model handed to the parent's Update on a Transition (`left: { studio }`)
  would be one API. Recorded under blocker 13.

## Testing

Foldkit's story tests init and update: a cold load into the gallery logs the
transition and asks for `LoadCatalog`, re-entering while a load is in flight
asks for nothing, entering and staying on Painting ask for `LoadPainting`
with the right id, a stale painting for another id is ignored, and leaving
the Studio asks for `SaveDraft` only if the draft is not empty.

What Effect Oak would need:

- Named Commands (blocker 4) and a typed `Node.step` (blocker 5) for every
  ChangedUrl case above; `record` is a plain function and testable today.
- "Re-entering does not load twice" is no longer a rule to test: it is the
  Catalog Child being created and destroyed. Testing it means running the
  tree: `Runtime.start` with a stub Location, or a way to say "the Gallery
  State has a Catalog Child in Loading" from a step result.
- Emitting a Lifetime's Message by hand (blocker 6) for `LoadedCatalog`.

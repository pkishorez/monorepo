# Query sync

Status: works, without a router. The URL is a Service the Nodes listen to;
what is missing for real routing is listed under Blockers.

## What was ported

Foldkit's `query-sync`: a table of dinosaurs with a name search, Diet and
Period filters and sortable columns (Ascending → Descending → none), all kept
in the query string (`?search=rex&diet=Carnivore&sorting=Length:Descending`).
Opening that URL restores the table; unknown values are ignored.

```
QuerySync (root)         Model { browse }; Lifetime: Url.query → ChangedUrl
                         ClickedColumnHeader → Command: Url.replace({ sorting })
├─ search: Param(search) Model { value }; Lifetime: its parameter → HeardUrl
├─ diet: Param(diet)     Edited → Command: Url.replace({ [name]: value })
└─ period: Param(period)
url/     Url Service: the query string as a Stream, `replace` without a history entry
param/   makeParam: a Node mirroring one parameter
table/   the dinosaurs, filtering and sorting, and the table
```

The URL is the one source of truth, as in Foldkit. Each Node that draws a
part of it listens to it itself; an edit goes out to the URL and comes back
as a Message. Typing one letter is three Messages: `Edited` in the search,
then `ChangedUrl` in the app and `HeardUrl` in the search.

## Deviations

- **No router.** Foldkit's app is `makeApplication({ routing })`: `init` gets
  the URL, `ChangedUrl` and `ClickedLink` are Runtime Messages, and
  `replaceUrl`/`pushUrl` are Commands. Here a `Url` Service in the app's
  Layer wraps `history.replaceState` and `popstate`, and the first URL
  arrives as a Message from a Lifetime.
- **`@foldkit/ui` Listbox became a native select**, inside a Param Child. The
  Listbox's open state would have been a Child too, but the selected value is
  the app's (roll-up 13), so each control mirrors its parameter instead.
- No NotFound route: the demo lives at one path the docs app owns.

## Blockers

- **No routing in the Runtime** (new, roll-up 15). What a router needs that
  Effect Oak lacks:
  - `init` cannot take the URL (or any input), so the starting URL is a
    Message just after init: Replay at step 0 draws the unfiltered table.
  - No URL change Message or link interception from the Runtime; each app
    writes its own Service and Lifetime.
  - Time Travel does not move the address bar: stepping back draws old
    filters while the URL shows the latest. A router would need the URL to be
    replayed from the Log too.
  - The docs app's TanStack Router owns the URL; writing it behind the
    router's back works only because nothing else reads the search here.

  An API could be `Runtime.start(node, { url })` with init receiving it, a
  `routing: { onUrlChange }` option on `toReact` that sends a Message, and
  navigation Commands, or an adapter to the host router.

- **A parent cannot pass data to a Child** (roll-up 13): each control listens
  to the URL itself rather than being given its value.

## Testing

Foldkit's stories check that `ChangedUrl` parses search, sorting, diet and
period, that an unknown path is NotFound, and that typing, sorting and
picking return `ReplaceFilters` with the right arguments
(`Command.expectHas`, `Command.resolve`). A router test checks the sorting
prints in the format it parses. Scenes draw a Model and check the rows.

What Effect Oak would need:

- Named Commands (roll-up 4) to see `Url.replace({ sorting: … })` asked for.
- `browse.ts` and `table/rows.ts` are plain functions and can be tested
  today, including printing and parsing sorting.
- A stub Url Service with a scripted query Stream: `Runtime.start` with a
  stub Layer can do it today, which tests the Lifetimes too.

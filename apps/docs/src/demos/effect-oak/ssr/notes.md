# SSR

Status: skipped. No route, no code: Effect Oak runs only in the browser, and
every demo route is `ssr: false`.

## What Foldkit's example does

A counter rendered on the server for each request. The count is kept in a
cookie; the server reads it, builds Flags (`initialCount`, `renderedAt`,
`renderedOn: 'Server'`), runs `init` and `view` with `Server.renderToString`,
and sends the HTML with the Flags serialized into it. The browser shows the
count before any JavaScript runs. `Runtime.hydrate` then reads the same Flags
back, calls `init` with exactly what the server used, and takes over the
existing DOM. Clicking + or − updates the Model and a Command writes the
cookie, so a reload is rendered with the new count.

Its tests are a scene (the count and "Rendered on the Server at …" are
drawn; clicking + increments and asks for `PersistCount`) and an e2e suite
that loads the page with scripting off and hydrated, and requires the two
DOMs to agree, including the tricky `<select>`, `<pre>` and `<textarea>`
cases.

## Why it does not fit here

- The docs app's demo routes are `ssr: false`: TanStack Start renders
  nothing on the server for them, and Effect Oak's `toReact` starts the
  Runtime in a `useEffect`, which never runs on a server.
- `toReact` renders nothing until the Runtime has started (it builds the
  Layer and the tree after mounting), so even with SSR on, the server HTML
  would be empty.
- `init` takes no input, so there is nothing to carry Flags from the server
  to the browser.

## What Effect Oak would need for SSR and hydration

1. **init with input** (blocker 3): `init(flags)`, with the flags kept with
   the Log so Replay starts from the same ones.
2. **Drawing a View from an init Model, with no Runtime**: build the tree
   with init alone (Replay already does this: `Replay.make(node, () => []).seek(0)`
   is the tree at step 0, with no Services) and render the root View to a
   string with React's `renderToString`. Views never see Services (ADR
   0004), so this already holds for them; `frame` would stand at Time 0.
3. **A serializable tree**: Models and States are Schemas, so the server can
   encode the whole tree (each Instance's Model and State, by Path) and the
   flags into the HTML.
4. **Resuming the Runtime from that tree**: `Runtime.start(node, { from })`
   that plants Instances from the decoded tree instead of running init, then
   starts their Lifetimes, so React's `hydrateRoot` finds the same DOM. Its
   Log would start with the flags (or the encoded tree) as Time 0, so Replay
   still works.
5. **Commands from init on the server**: either not run until the browser
   resumes, or run and awaited on the server before rendering (Foldkit runs
   none on the server).

The roll-up lists this as blocker 20.

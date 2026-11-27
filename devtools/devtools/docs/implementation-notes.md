# Implementation notes

What the code cannot say for itself: limits set by Vite, Node, git, the
browser or a library, and the reasons behind choices that look simpler done
another way. The code holds no comments; a note that explains our own code
belongs in a better name, a type or a test instead.

## Dev server and build

### The dev proxy checks Origin itself

In dev, Vite proxies `/health`, `/rpc` and the Kabuki WebSockets to the
DevTools Server, and rewrites every request's Origin to the server's own
origin. That rewrite would get past the server's origin check, so the proxy
runs the same check first, in `scripts/dev-proxy.ts` (`isTrustedOrigin`). It
lets through a request with no Origin, as the CLI sends, or one whose Origin
host matches its Host, which is the dev UI Vite serves. Only `/v1`, OTLP,
skips the check, because OTLP takes any origin. The Kabuki rule matches only
`/kabuki/sessions` and `/kabuki/session/`, because the `/kabuki` page itself
stays with Vite.

### Port and hosts

`pnpm dev` runs under portless, which sets `PORT` and forwards its own Host
headers, so `PORT` comes before `DEVTOOLS_UI_PORT`. `allowedHosts: true` lets
portless and tunnels such as cloudflared reach the dev UI; without it, both
break.

### Shiki grammars are pre-bundled

The source viewer in `@kestack/web-platform` loads Shiki grammars lazily, one
per file type. Left out of `optimizeDeps.include`, Vite finds them
mid-session and re-optimizes, and the first JSON or CSS file opened fails to
load.

### How the CLI is packed

The CLI and its server ship as one minified file, `dist/cli/main.mjs`, with
every JavaScript dependency inlined but `@kestack/monoverse`, whose
`oxc-parser` and `oxc-resolver` are native and installed with it. The
Monoverse engine worker is packed alone, as `dist/cli/monoverse-engine.mjs`,
so a check never blocks the server. The second pack sets `clean: false`, or it
would delete the first one's output. The server finds the UI at `../ui/` from
its bundled file, not its source file, hence `UI_ROOT_BESIDE_BUNDLED_CLI`.
The Claude Agent SDK, which the Agent reaches through the private
`@kestack/ai-toolkit-v2`, is inlined too: it is plain JavaScript, and it starts
the `claude` installed on `PATH`, never the binary of its optional platform
package, so that package is not needed.

## The server

### It stops without draining requests

`disablePreemptiveShutdown: true` is required. Without it,
`@effect/platform-node` waits up to 20 seconds on shutdown for open requests
to drain, and a Kabuki Session's socket stays open as long as its app runs, so
every stop would hang until the timeout.

## Lotel

### Spans are checked once

`SpansSchema` only checks that the value is an array. The Spans were already
checked against the Telemetry RPC's Schemas when they arrived; checking each
Span again on every Update would make one keystroke cost as much as the whole
Trace list. Do not replace it with `Schema.Array` of a Span schema.

### Waterfall bars sit inside a margin

The bar track insets itself with margin, not padding, to line up with the
header's ticks (`BAR_COL_INSET` in `gantt-row.tsx` and `gantt-header.tsx`). An
absolutely positioned bar takes its percentage width from its container's
padding box, so with padding the bars would drift off the ticks.

## Monoverse

### Commit copies on disk

A branch no worktree has is copied to disk so `@kestack/monoverse` can read
it (`services/snapshots/real/commit-copy.ts`). The copy holds the whole
commit, not only the Project's folder, so a root tsconfig or package.json above
the Project reads as it does in the checkout.

Git never holds `node_modules`, so the checkout's, the repository's and each
Package's, are linked into the copy. Without them, a tsconfig that extends an
installed package cannot be read and its aliases fail. A link that points at
nothing, because the copy was written before an install or its worktree was
removed, is made again on every open.

A copy is written under a temporary name, its marker file last, then renamed,
so a half-written copy is never read. If the rename fails because another
process finished first, that copy is used. The OS may clear its temp folder
file by file, so the marker alone does not prove a copy whole: every file is
checked once per process, and the marker trusted after that.

### The engine runs in a worker thread

`@kestack/monoverse` reads, parses and resolves synchronously. On the server's
thread, checking a large Project would stop it answering anything else, such
as Lotel or Kabuki Sessions, so each job runs in a worker thread
(`rpc/project/real/engine.ts`). From source the worker is `engine-worker.ts`,
loaded with Node's type stripping; in the packed CLI it is
`monoverse-engine.mjs`. The worker imports only packages, so it loads the same
way in both.

### Old rows in the Project store

`label` stays in the stored entry's schema only so rows written when Projects
had labels still decode; it is written null and never read. `tool` divides
the store: every entry is written as `monoverse` and only those are listed.
Rows from the retired Laymos Tool stay in the table unread, so `'laymos'` must
stay in the `tool` literals.

### The pinned "All packages" row is a `CommandGroup`

When a search filters a package list, cmdk re-sorts the DOM and moves any item
outside a group to the end. The sticky "All packages" row in
`package-menu.tsx` is its own `CommandGroup` for that reason; a plain wrapper
would fall below the matches.

### Virtual rows re-read heights only when `keyOf` changes

`useVirtualRows` hands `sizeOf` to TanStack Virtual as `estimateSize` and
`keyOf` as `getItemKey`. TanStack recomputes row positions only when
`getItemKey` changes, not `estimateSize`, so a caller hands in a new `keyOf`
whenever its rows or their heights change, and puts the height in the key, as
`file-list.tsx` does. A `keyOf` memoized without the height leaves stale row
heights on screen.

## Agent

### Every run starts its own Claude Code process

Claude Code takes a session's options, the JSON Schema of `outputFormat`
included, only when its process starts; a live process keeps the ones it
started with. A Thread's follow-up may bring another schema, or none, so the
Agent's `Claude` Layer lingers for no time (`linger: 0`): the process stops
when its run ends, and the next run resumes the session with its own options.

### Read-only, and nothing else

Each run passes `tools` of Read, Grep and Glob, so Claude Code has only those
three, plus the `StructuredOutput` tool an `outputFormat` adds. Claude Code
runs them without asking; `permissionMode: 'dontAsk'` denies anything else
instead of asking, so a run never waits on a permission request. They are not
also in `allowedTools`: the SDK would warn on every run that `canUseTool` is
shadowed. `strictMcpConfig` with no
`mcpServers` leaves out every MCP server the user's settings or claude.ai
account would bring, since their tools may write. Claude Code reports paths
from the folder's real path (`/private/tmp` for `/tmp` on macOS), so activity
lines are shown relative to that.

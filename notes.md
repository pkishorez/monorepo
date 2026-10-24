# Machines: notes

Hacks, shortcuts, observations and future improvements from building Machines (`ai-toolkit serve` reachable through a Cloudflare tunnel, listed by the Machines Backend, opened from the code app's Machine Switcher).

## Known weak spots (decided on purpose)

- The Machine Key never changes (ADR 0015). Anyone who reads it once can reach that Machine. Fix: rotate the key on each start, or move to signed short-lived tickets.
- Forgetting a Machine does not revoke its Sign-in at the Auth Worker (ADR 0016). auth-toolkit allows revoking only from its own pages. The Backend refuses the Machine from then on, and the confirmation links to the Auth Worker's Home Page.
- Quick tunnels (`trycloudflare.com`) come with no uptime promise and are rate-limited. A named tunnel is the upgrade path.

## Setup changes

- `cloudflared` 0.7.3 was added to the catalog and to ai-toolkit's dependencies. Its postinstall is turned off (`allowBuilds: cloudflared: false`), so `serve` downloads the binary on first run.
- `@kestack/auth-toolkit` was added to ai-toolkit as a peer dependency (like the other @kestack packages). An `npm i -g @kestack/ai-toolkit` user needs the peers too; worth reconsidering for a CLI.

## Client (rpc-toolkit, ai-toolkit client)

- The rpc-toolkit WebSocket client takes `protocols`, either fixed or as an Effect re-run on every connect. Effect's own WebSocket only accepts fixed protocols, so a protocols Effect goes through a WebSocket constructor of our own instead of `layerWebSocketConstructorGlobal`. That is safe only because each layer makes one connection at a time.
- The `Ai` Replica is now keyed by Machine id (`ai-m3`). Every device syncs from scratch once. `retired` hard-codes the old unkeyed names (`ai`, `ai-p1`..`ai-p3`).
- Risk: every Machine's copy syncs through whichever `AiClient` is provided, and an unused copy keeps running for 30s (`gcTime`). The app must tear down the copy together with its client when switching Machines, or Machine B's records could land in Machine A's store. A sturdier fix: a gate that checks the Machine id the server reports against the copy's key.

## Machines Backend (`@kestack/ai-toolkit/machines/backend`)

- The table is keyed by Machine id alone, so the database itself enforces "one id, one owner". A `byOwner` index serves List.
- The "forgotten Sign-in" check scans the caller's own Machines (no index). That's fine for a handful; index it if Machines ever number in the hundreds.
- Stored numbers use `Schema.Finite`, because the std-toolkit snapshot guard rejects plain `Schema.Number`.
- The client posted to `/rpc/` (trailing slash), so the Backend's router strips trailing slashes. Worth finding out where the slash comes from (`MachinesClient` or rpc-toolkit's http client).
- `Forget` on another User's id quietly does nothing; the contract has no error for it.
- A Report signed with an OAuth Access Token keeps the Sign-in id stored before it (Machines only sign in with Device Login, so this shouldn't happen).
- `serve` is only tested over node SQLite (`serveOver`). The D1 path isn't unit-tested because ai-toolkit has no Miniflare; the dev run covers it.
- ai-toolkit's README Usage section now has 4 scenarios; the README conventions allow 3. Needs trimming.

## code app deployment (Alchemy)

- `pnpm --filter code dev` uses real auth (`auth.kishore.computer`); `pnpm --filter code dev:local` uses Local mode (`AUTH=local`). Local mode on any deployed stage throws.
- The Machines Worker is at port 4591, `api-code.kishore.computer` in dev (`<branch>.api-code.kishore.computer` in a worktree, which ai-toolkit's `pnpm dev` finds with `portless get api-code.kishore`; two worktrees can't both run it, since the port is fixed), `api-code.kishore.app` in prod, `pr<N>-api-code.kishore.app` on PR stages. D1 database: `code-machines-<stage>`.
- In a worktree the site's dev host is branch-prefixed (`<branch>.code.kishore.computer`). It's still under `.kishore.computer`, so the cookie and serve's `*.code.kishore.computer` origin rule both cover it.
- vite.config.ts aliases `debug` to its browser build. Under `alchemy dev` the site's server code runs in workerd, where `debug`'s Node build (pulled in by micromark's dev build, via the markdown viewer) reads `process.stderr.fd` and throws. Changing the SSR resolve conditions didn't help, because the Cloudflare plugin's dep optimizer still used the `development` condition. A cleaner fix belongs in Kabuki Start or web-platform.
- After changing the vite config, delete `apps/code/node_modules/.vite`; stale pre-bundles kept the old crash.
- QUIC (UDP 7844) is blocked on this network, so `serve` tunnels over HTTP/2. A tunnel took about 35s to connect here.
- There is no CI deploy workflow for code yet (kabuki-start has `deploy-kabuki-start.yml`).
- While testing, the infra agent ran `pkill -f "alchemy dev"`, which may have stopped `alchemy dev` processes in other worktrees. Restart any that are gone.

## `ai-toolkit serve` (Machine, tunnel, Heartbeat)

- auth-toolkit doesn't export `localToken`/`localUser` publicly, so `src/machine/sign-in/local.ts` has a copy (a test checks it matches). Fix: export them from auth-toolkit.
- In Local mode the bearer is attached by finding auth-toolkit's guard middleware by its key string (`@kestack/auth-toolkit/rpc/Auth`) and registering a client middleware for it. That's fragile; auth-toolkit could export a `bearer(token)` signing layer instead.
- The tunnel counts as up only once cloudflared reports `connected`. The URL prints first and answers 530 until then.
- The cloudflared binary downloads into the pnpm store (`node_modules/.pnpm/cloudflared@0.7.3/.../bin`), so a reinstall loses it. `~/.ai-toolkit/bin` would be a better home.
- `logout` forgets the whole Machine record (id, key, owner, name), so the next start's name falls back to the hostname.
- `logout` fails while the Backend or Auth Worker is unreachable, since it won't skip revoking the sign-in.
- If the Auth Worker can't be reached at start, the stored sign-in is trusted.
- A tunnel restarts after 3 failed checks at the default 15s interval, so about 45s.
- Unlike `ws`'s default (echo the first offered protocol), the server answers only `ai-toolkit`. It never echoes the key, and refuses before the handshake: 401 with no key, 403 with a wrong one.

## code app (sign-in, Machine List, Machine Switcher)

- Kabuki pages are top-level Children of their parent page, so a root State can't Provide a Machine's connection to them. So the Machine is its own page, `/m/:machineId`, and every place URL now starts with the Machine id. `/` is an Open page that opens the last Machine. A new Machine id is a new page, so its socket, Replicas and `Ai` copy close together. This is explained in `shell/machine/socket.ts`, but no test proves it yet.
- `socket.ts` repeats AiClient's `['ai-toolkit', 'key.<key>']` handshake so the URL and key are read again on every connect, which picks up a new tunnel URL. Better: let `AiClient.layer` take an Effect for the URL and key, and drop the copy.
- A page's own Commands can't use what the page Provides. So Un-settle moved into a child actor (`machine/unsettle.ts`), and so did the socket status (`connection/actor.ts`).
- The saved Machine List is stored as JSON text, because the record store rejects the `Schema.Number` fields in `Machine`. Switching the contract to `Schema.Finite` would let it be stored as a record.
- Unseen marks from before Machines are no longer read; every Session starts as seen.
- "Machine down" compares the Backend's Last Seen with the browser's clock, so clock skew can mislabel a Machine. Fix: have the Backend return its `now` with List.
- Deleting local data on sign-out is best effort: it only covers Machines in that Account's saved list. A Machine forgotten from another device keeps its local data here.
- The Machine Switcher has no keyboard shortcut yet.
- There's no test of the Machine page or root page as a whole (they'd need a router-level test). The browser run covers them.

## End-to-end run (Local auth, two Machines, real tunnels)

All 9 scenarios pass: sign-in, Machine List and Switcher, project and a real Claude session over the tunnel, switching with separate data per Machine, the key check (401 with no key, 403 with a wrong one, 101 with the right one), a Machine going down and coming back, forget and logout, a second account, and reopening from the saved list with the Backend unreachable. Screenshots are in `/tmp/qa/` (they won't survive a reboot).

Fixed during the run:

- Forget in Local mode stopped every Machine of that email, because all of them share one Local Token. In Local mode the Backend now refuses only the forgotten Machine id (ADR 0016 updated).
- "last seen just now" was shown for stale Machines; "just now" now means under 10s.
- The "No Machine yet" screen had no way to sign out or switch accounts; it now has the account menu.
- The Switcher re-sorted on every heartbeat, so rows jumped. Online Machines now sort by name, the rest by most recently seen.
- Forget buttons are labelled per Machine for screen readers.

Seen but not fixed:

- With a valid key, any Origin is accepted on the socket. The key is the only gate.
- A forgotten Machine restarted on the same database briefly listens on its local port before the first Heartbeat refuses it. Fix: report once before opening the server.
- While a restarted Machine's tunnel is starting, the header says "tunnel is broken: It has no address". "Starting" would be more accurate.
- With the Backend unreachable, the saved list still says "Online" until the down threshold passes.
- The Switcher's footer shows "mod+Enter done", which means nothing in a single-choice list.
- Settings → Machines doesn't mark the Machine you're on.
- In the Project Picker, an empty folder says "No folder by that name" even with no search typed (this predates Machines).
- Signing out and back in deletes and fully re-syncs that Account's local Machine data.
- The dev D1 still has tombstones carrying the shared Local token from before the fix; they're ignored now.
- After a restart, the app took about 60s to reconnect: about 37s for the tunnel, then the next List refresh. Pushing the new address (or refreshing List when a socket keeps failing) would cut that.

## Review fixes

An independent review found a critical hole and six smaller ones. All are fixed:

- **Critical:** the key check named only `/rpc`, but the router also answers `/RPC`, `//rpc`, `/%72pc` and an absolute URL. All of those reached the API with no key. Every path but exactly `/health` now needs the key, with a test per spelling.
- The Backend refuses cookie calls whose Origin isn't the site (a sibling page under `.kishore.app` could otherwise Report a fake Machine into your list).
- The Machine page opens nothing until the Machine is in the signed-in Account's list, so another Account on a shared browser can't read it.
- Forget and sign-out delete a Machine's local data only after its page has closed (`apps/code/src/shell/machines/records.ts`).
- After the Backend refuses its Sign-in, the Machine never reuses the stored one, and backs off (1s doubling to 1 min) before trying again.
- `logout` tells the Backend to Forget the Machine before signing out.
- A Report's `url` must be `https://` (≤256 chars), and name, id, key and version are length-capped. The app only dials `https` addresses.

Left from the fixes:

- The app checks List against the stricter schema, so one old stored row with a bad URL or long name would break that User's whole List. Dev D1 rows are fine; worth a lenient read later.
- `Records` deletes from a detached background task, because Kabuki closes a page's `provides` before its Children. It relies on the Store waiting for open copies to stop. It only tracks this tab's page; other tabs are told to stop by the Store.
- If the Auth Worker can't be reached right after the Backend refuses the Sign-in, the Machine stops rather than retrying.
- The backoff tests depend on timing (they passed 3 runs in a row).
- `logout`'s Forget call has no test (there's no fake for Device sign-in).

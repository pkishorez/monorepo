# code

The app for running Claude Code and Codex sessions in project folders on any of your Connections, through Connect, at code.kishore.app.

## Big picture

`code` is the first app on [`@kestack/connect`](../connect/README.md). Its
`code` Plugin runs Claude Code and Codex in folders on each of your
Connections (through [ai-toolkit](../../toolkits/ai-toolkit/README.md), as the
[v1 spec](../../toolkits/ai-toolkit/docs/v1-spec.md) says), and the app
follows each Session live: what you asked, the agent's words, its tool
calls and subagents, and how each turn ended. You sign in with
auth-toolkit's `Accounts`; Cloud Connect lists the Connections signed in as
you, and the app is on all of them at once
([ADR 0018](../../toolkits/ai-toolkit/docs/adr/0018-an-app-is-on-every-connection-at-once.md)).

It is a Kabuki Start app, every page drawn in the browser
([routing](../../packages/kabuki/docs/routing.md)). `/` picks a Project on
any Connection, `/settings` holds this device's settings, your keys and one
card per Connection, `/m/:connectionId/p/:projectId` is a new Session in a
Project and `…/s/:sessionId` is a Session. Records arrive only through the
`CodeReplica` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
one Instance per Connection over its own socket, kept in IndexedDB, so a
reload shows what this device last saw at once. The sidebar keeps every
Session it shows in sync ahead, so opening one draws its messages at once.
Every write is a Command an Actor asks of one Connection. While a Connection's
code Plugin is Updating or stopped, or it runs a `ke-connect` older than
Cloud Connect names, a pill in the header of a page on it says so and
opens Settings, whose card for it shows how far the update got, the
stopped Plugin's last lines to copy, or the command that updates it.

The app is one tree of Kabuki Actors, and `src/device/` tells it as one
story, top down, each level with at most three parts: Device, then Account,
then Connections, then `connection/`, `voice/` and `layout/`, then the sidebar,
the Pickers and the pages. [docs/kabuki-tree.md](docs/kabuki-tree.md)
walks it, with what each level keeps in storage. Voice is global: a
Dictation starts anywhere, keeps going as you move, and its text goes into
the Draft on screen when it stops, or into the dictation list to paste
later. When an agent asks you something, as Claude's `AskUserQuestion` or
Codex's `request_user_input`, the Question Panel takes the Draft's place,
one question a step, until you answer or skip it; you can minimise it to
read the session, and the sidebar stays yours throughout. `src/ui/` holds
plain parts with no data.

The words the app uses, such as Draft, Dictation, Picker and Connection List,
are in [CONTEXT.md](CONTEXT.md). Plans in progress are in
[docs/draft-and-dictation-plan.md](docs/draft-and-dictation-plan.md) and
[docs/mobile-plan.md](docs/mobile-plan.md). The app is a PWA
([`@kestack/web-platform/pwa`](../../platforms/web-platform/README.md)):
it installs as "Code", works offline as each page's Render Mode says, and
waits for "Reload" before taking a new version.

## Usage

### Run the app on this branch's Connect

`pnpm dev` makes sure this branch's Connect runs, starting it or reusing
the one another App started, then runs the site against it. It signs in
with auth-toolkit's Fake: sign in as any `@kestack.test` email
(`dev@kestack.test` is the Connection's), and the branch's Connection shows up in
the app; it reports itself to Cloud Connect every 15 seconds. Every backend
is on the site's own origin, so a tunnel to it, such as
`cloudflared tunnel --url http://localhost:<port>`, opens the whole app on
a phone. `pnpm dev:real` signs in through the Auth Worker instead.

```sh
pnpm --filter code dev           # this branch's Connect, then the site, signed in with the Fake
pnpm --filter code dev:real      # the same through the Auth Worker; the Device Screen on a new branch
pnpm --filter code deploy        # your own stage, at its workers.dev URLs
pnpm --filter code deploy:prod   # ALLOW_DEPLOY=true: code.kishore.app
```

- `pnpm dev` calls `withConnect` from `@kestack/connect/dev`
  ([Connect in development](../connect/docs/dev.md)), then runs
  `alchemy dev` (`alchemy.run.ts`, `src/deploy/infra/`) through Portless,
  the site at `https://code.kishore.computer` (the branch in front in a
  linked git worktree), handed the branch's Cloud Connect in
  `CONNECT_URL`. Connect stops once no App on the branch runs.
- The site gets `VITE_AUTH_URL` and `VITE_CONNECT_URL`. A deployed stage
  uses `https://connect.kishore.app`, where your Connections are.
- With no Connection, home says what to run; each Connection that signs in
  shows up beside the others.
- A deployed stage (`prod`, `demo`, `pr<N>`) needs `ALLOW_DEPLOY=true` and
  keeps its state in Cloudflare; a personal stage keeps it in `.alchemy/`.
- `pnpm --filter code lint` checks types, the Laymos Rules and the tree's
  shape (`pnpm --filter code tree`); `pnpm --filter code test` runs the
  tests. Videos recorded under `qa/` stay local.
- `pnpm --filter code size` builds the app and fails if its first load,
  the entry chunk and every chunk it imports, gzipped, is over its budget
  in `scripts/size.ts`. Settings, the project and session pages, the
  Draft and the Kabuki page load apart, through `View.lazy`.
- `pnpm --filter code bench` times the transcript of a long made-up
  session (`bench/`) in Chrome at a phone's size, its CPU slowed four
  times: opening it, leaving and coming back, words streaming in, a fold
  opened, scrolling to the top, and whether what is drawn above the view
  after it opens moves it. `--out` keeps the numbers and `--compare`
  sets new ones beside them; `--profile <move>` lists where its time goes.
- `pnpm --filter code draw:install` redraws the iOS Splash and the
  manifest's screenshots into `public/`, after a build of the packages.

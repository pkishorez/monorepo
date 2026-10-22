# code

The local app for running Claude Code and Codex sessions in project folders, on an ai-toolkit server, at code.kishore.computer.

## Big picture

`code` is the first app on [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md):
a server on this machine that runs Claude Code and Codex in folders and
serves one projected Message form over WebSocket. How the server thinks is in
its [v1 spec](../../toolkits/ai-toolkit/docs/v1-spec.md). The app adds a
folder as a project, starts sessions in it with either agent, and follows
each one live: what you asked, the agent's words, its tool calls and
subagents, and how each turn ended. It is local only, with no sign-in.

It is a Kabuki Start app, every page drawn in the browser
([`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md)).
Four places: `/` picks or adds a project, `/p/:projectId` lists the
project's sessions over a composer that starts a new one,
`/p/:projectId/s/:sessionId` is a session,
and `/settings` sets the program each agent runs as (its Harness Binary). An
agent whose program does not run is greyed out where sessions start.
All state lives in the pages' actors; the Views only draw and send. The
server's records arrive only through the `Ai` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
read by Queries and kept in IndexedDB, so a reload shows what this device
last saw at once: projects and sessions whole, and a session's messages
once its page has been open. Every write is a Command an actor
asks for through `AiClient`. The root page follows the connection: while
the server is out of reach, the header says so and nothing can be sent.

A message is written in the composer (`src/client/composer/`), a
CodeMirror editor pinned at the bottom of both pages. A `/` at the start of a
word, or the Skills button over the text, opens a palette of the agent's
Skills; the one picked goes in as a `/name` chip the cursor steps over and
Backspace removes whole. Files come by paste, drop, or the paperclip. Under
the text, one picker holds the agent and its model, and another the agent's
settings; once a session has started, only its model and settings change,
from the next message on. In a session,
`/btw <question>` asks the session on the side and shows the answer in a
popover; nothing is kept. Each finished turn can be forked from, which opens
a new session that remembers the conversation up to that turn, and the
session menu regenerates its title. Background Jobs the agents left running
show in a bubble at the top right, grouped by session, each with a Stop
button.

The transcript pairs Messages as it draws them (`thread.ts`): a tool call
runs until its result arrives, and is stopped if its turn ended first; a
subagent's call holds the Messages whose `agentId` is its id, nested,
under its prompt; a turn's usage is its `turnEnded` usage, or the sum of its usage parts;
streamed text and reasoning arrive a few sentences at a time as `textChunk`s,
joined by `streamId` into one block where the first chunk is. Each tool call
reads as a verb and its target, with paths relative to the project's folder
and an edit drawn as its diff (`tools.ts`); a run of calls of one kind folds
into one line.

The keyboard comes from `@kestack/use-keys`, defined in one file
(`src/client/keys.ts`): the sidebar and the page are the two Surfaces you work
in, the composer is part of the page, and the skills palette, model picker and
help sheet over them are Surfaces open while Active. `Mod+Alt+V` or Settings
turns Vim Mode on, kept in localStorage; the app then floats as a window whose
status line says where you are, `?` lists every key, `Ctrl+H` or `Space e` and
`Ctrl+L` move between the sidebar and the page, `j`/`k` move through either,
`h`/`l` fold and unfold a project, `i` writes, and `Ctrl+[`/`Ctrl+]` open the
previous and next session, even while typing. Page Up and Page Down, `Mod+.`
to stop a turn, and `Mod+Shift+M` for the model work always.

## Usage

### Run the server and the app

Build ai-toolkit and start its server on port 4590, then start the app.

```sh
pnpm --filter @kestack/ai-toolkit build
node toolkits/ai-toolkit/bin/ai-toolkit.mjs serve --port 4590 --db /tmp/ai-dev/ai.db
pnpm --filter code dev
```

- `dev` builds the workspace packages the app uses, then serves it through
  portless as `code.kishore`; open the URL it prints.
- The app reaches the server at `VITE_AI_URL`, `http://127.0.0.1:4590/rpc`
  unless set; `http` becomes `ws` on its own.
- Without `--db` the server keeps its database at `~/.ai-toolkit/ai.db`.
- `pnpm --filter code lint` checks types and the Laymos Rules; `pnpm --filter
code test` runs the tests. Videos recorded under `qa/` stay local.

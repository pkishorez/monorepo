# ai

The local app for running Claude Code and Codex sessions in project folders, on an ai-toolkit server, at ai.kishore.computer.

## Big picture

`ai` is the first app on [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md):
a server on this machine that runs Claude Code and Codex in folders and
serves one projected Message form over WebSocket. How the server thinks is in
its [v1 spec](../../toolkits/ai-toolkit/docs/v1-spec.md). The app adds a
folder as a project, starts sessions in it with either agent, and follows
each one live: what you asked, the agent's words, its tool calls and
subagents, and how each turn ended. It is local only, with no sign-in.

It is a Kabuki Start app, every page drawn in the browser
([`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md)).
Three places: `/` picks or adds a project, `/p/:projectId` starts a session
and lists the project's sessions, `/p/:projectId/s/:sessionId` is a session.
All state lives in the pages' actors; the Views only draw and send. The
server's records arrive only through the `Ai` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
read by Queries and kept in memory: projects and sessions whole, and a
session's messages while its page is open. Every write is a Command an actor
asks for through `AiClient`. The root page follows the connection: while
the server is out of reach, the header says so and nothing can be sent.

The transcript pairs Messages as it draws them (`thread.ts`): a tool call
runs until its result arrives, and is stopped if its turn ended first; a
subagent's call holds the Messages whose `agentId` is its id, nested,
under its prompt; a turn's usage is its `turnEnded` usage, or the sum of its usage parts.

## Usage

### Run the server and the app

Build ai-toolkit and start its server on port 4590, then start the app.

```sh
pnpm --filter @kestack/ai-toolkit build
node toolkits/ai-toolkit/bin/ai-toolkit.mjs serve --port 4590 --db /tmp/ai-dev/ai.db
pnpm --filter ai dev
```

- `dev` builds the workspace packages the app uses, then serves it through
  portless as `ai.kishore`; open the URL it prints.
- The app reaches the server at `VITE_AI_URL`, `http://127.0.0.1:4590/rpc`
  unless set; `http` becomes `ws` on its own.
- Without `--db` the server keeps its database at `~/.ai-toolkit/ai.db`.
- `pnpm --filter ai lint` checks types and the Laymos Rules; `pnpm --filter
ai test` runs the tests. Videos recorded under `qa/` stay local.

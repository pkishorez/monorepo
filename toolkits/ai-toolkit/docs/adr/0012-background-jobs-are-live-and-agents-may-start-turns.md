# Background Jobs are live, and agents may start Turns

Note: the harness's live handle, called `HarnessSession` when this was written, is now `Agent`, and the engine is the `code` App Group in `@kestack/connect`.

A Background Job (a shell process or subagent that outlives its Turn) exists only while the server runs. Each live agent reports its jobs as a stream of whole snapshots (`Agent.backgroundJobs`), the engine keeps the latest per Session in memory, and the API streams them to clients; none of it is stored, and a restart clears them, since the processes behind them die with their agent. A job can be stopped by id.

When a job finishes, Claude Code may start a Turn on its own. The harness reports these on `Agent.agentTurns`, one stream per Turn that ends with its own end and Fork Point like a user Turn's (ADR 0013), and only between user Turns. The engine runs each as an ordinary Turn whose `turn.started` Raw has `agentStarted: true` and empty text, so it is stored, projected, cancelled and forked like any other.

## Considered options

- **Store Background Jobs as entities.** Rejected: a stored job would outlive the process it names, and every restart would need a sweep to mark them gone. A live snapshot has nothing to reconcile.
- **Fold an agent's own output into the next user Turn.** Rejected: the output would be dated wrong and lost if the user never writes again.
- **Keep disabling Claude's background tasks.** Rejected: long builds and watchers are what users run them for.

## Consequences

- A client that reconnects gets the whole current set at once; there is no history of jobs.
- Codex keeps background terminals and sub-agents as jobs but starts no Turns of its own; its `agentTurns` never emits.
- An agent turn that arrives while a user Turn runs is the harness's bug, not the engine's case to handle.

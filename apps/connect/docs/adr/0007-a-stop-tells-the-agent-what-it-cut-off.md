# A stop tells the agent what it cut off

Status: accepted.

A Session's work is its running Turn and its agent's Background Jobs. A stop can cut off either: the server stopping kills both, and an Agent that closes, as a failed Turn closes it, kills its jobs. Before this, a restart Resumed only a cut-off Turn, and jobs vanished without a word to the agent or the user.

So the Session's record keeps its jobs, `jobs`, as the Agent last listed them while open. The list is only saved when the Agent reports it, never when the Agent closes, so after a close or a stop it holds what was cut off. The Bootstrap Sweep Resumes a Session that was running a Turn or had jobs, once, with a prompt that lists each: the Turn, the subagents, and the commands. A Session not Resumed keeps the list, and the next message tells the agent before the user's words. Either way the Turn's `turn.started` carries `cutOff`, so Code shows what was stopped, and the list is emptied.

A Cancel stops the Turn and every job, so a Session the user stopped runs nothing. A job can still be stopped on its own.

What a background subagent writes between Turns is stored as it comes, into the Session's latest Turn (ai-toolkit's ADR 0012). Code finds a subagent's records by its tool call, whichever Turn they are in.

## Considered options

- **Read what was running from the transcript at start.** Rejected: every Session's last Turns would be read at every start, and a job started several Turns back leaves no sign in the last one.
- **Store each job as an entity.** Rejected, as in ADR 0012: one list on the Session is all a restart needs.
- **A Cancel stops the Turn only.** Rejected: a stopped Session that keeps working is the ambiguity this removes.

## Consequences

- The Session record is v3; a v2 Session reads with no jobs.
- A Claude Code process that exits on its own clears its jobs first, so its cut-off jobs are not told; Code still shows them stopped, as no end came for them.

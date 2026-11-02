---
'@kestack/ai-toolkit': patch
---

What a background subagent writes is kept as it comes, and a Background Job's end is a Message.

**New**

- `Agent.between`: what the agent writes while no Turn runs, a background subagent's records and a job's end, as it comes. Claude Code no longer holds them for the next Turn; Codex and the fake harness give none.
- A `jobEnded` Part, projected from Claude Code's `task_notification`: the job, the tool call that started it, and `done`, `failed` or `stopped`.
- A `toolCall` may be `background`: its result only says it started.
- A `turnStarted` may carry `cutOff`: the Turn and the Background Jobs a stop cut off before it.
- `BackgroundJob.toolCallId`: the tool call that started a job, when the harness says.
- Messages are v3, and `PROJECTION_VERSION` is 6.

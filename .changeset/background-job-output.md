---
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
---

A Background Job's output can be followed live.

**Added**

- `Agent.backgroundJobOutput(id)` streams what a shell job writes: the last 64 KiB of it at once, then each piece as it comes, until the job ends. Claude Code's is read from the file its tool result names; Codex's comes from `item/commandExecution/outputDelta`, kept from the command's start so it can be read however late it is asked for. A subagent job gives nothing.
- A `BackgroundJob` carries `tokens`, a subagent's tokens so far, from Claude Code's `task_progress`.
- A Codex background terminal's job names its `toolCallId`, the command's item.
- Connect's `backgroundJobOutput` RPC streams one Session's job output.

**Changed**

- A Session's record keeps its jobs without `tokens`, so its stored shape is as before, and a subagent's progress never rewrites it.

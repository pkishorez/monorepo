---
'@kestack/ai-toolkit': patch
---

A `toolResult` says when its call went on in the background, asked or not.

**Fixed**

- Claude Code may launch a subagent async with no `run_in_background` in its call, and gives a command a background task on its own. Its result now carries `background: true` (from `isAsync`, `status: 'async_launched'` or `backgroundTaskId`), so a client knows the call runs on until its `jobEnded`, rather than taking the "launched" result as its end. `PROJECTION_VERSION` is 7.

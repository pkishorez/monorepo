---
'@kestack/ai-toolkit': patch
---

`mcpStatus` and `contextUsage` are Queries on the Session actor, answered from the agent while it is open: they no longer open a closed agent, and answer `HarnessFailed` ("The session's agent is not running") instead. `stopBackgroundJob` is a `StopJob` Message to the Session, whose Command tells the agent; the call waits until the job has left the agent's list, or fails with `HarnessFailed` carrying the harness's reason when it refused.

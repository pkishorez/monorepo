---
'@kestack/ai-toolkit': patch
---

An App can give an Agent instructions of its own.

**Added**

- `AgentConfig.instructions`, added for every Turn of the Agent, Resumed and Forked ones included: appended to Claude Code's system prompt, and sent to Codex as `developerInstructions` when a thread starts or resumes.

**Changed**

- Claude Agents now always run on Claude Code's own system prompt (the `claude_code` preset), where before they had the Agent SDK's default.

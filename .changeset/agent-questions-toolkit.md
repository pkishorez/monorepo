---
'@kestack/ai-toolkit': patch
---

Claude Code and Codex now ask Agent Questions instead of having them declined: an Agent's `questions` lists the ones its running Turn waits on, and `answer` answers one by Item id, or declines it with null so the agent carries on. Claude Code's `AskUserQuestion` is held in `canUseTool` until answered; Codex's `request_user_input` is held as the request it is, and Codex is started to ask outside Plan mode too. Each goes once answered, when Codex or Claude Code drops it, and when its Turn ends.

A question shows in the transcript as a `question` tool call, and its answers as its result. Codex keeps no item for one, so the harness records its own, `question.asked` and `question.answered`.

---
'@kestack/ai-toolkit': patch
---

Claude Code and Codex can ask Agent Questions instead of having them declined. An Agent's `questions` lists the open ones; `answer` answers one by Item id, or declines it with null.

Questions show in the transcript as a `question` tool call and a `questionAnswered` part. `PROJECTION_VERSION` is 5. The fake harness gains `refuseAnswers` and `lateAnswers`.

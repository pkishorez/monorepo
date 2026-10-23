---
'@kestack/ai-toolkit': patch
---

A Session can be forked after any finished Turn: `forkSession { sessionId, afterTurnId }` (null for the latest) makes a new Session on the same harness that remembers the conversation up to that Turn and nothing after it, and `Session.forkedFrom` names where it came from. Forks of forks work too. Each `turn.ended` now carries the agent's `nativeTurnId` as its Fork Point; a Turn that ended without one cannot be forked after (`NotForkable`). `ask { sessionId, question, schema }` puts a side question to a Session and answers in text, or in JSON shaped by the schema, without changing the Session or keeping the answer (`AskFailed` when it cannot). `regenerateTitle` writes a new Title from the Session's last five user messages.

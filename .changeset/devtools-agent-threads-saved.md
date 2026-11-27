---
'@kestack/devtools': patch
---

The Agent saves its Threads in DevTools' database, so Story's and the Chat's conversations survive a restart, and a follow-up resumes the same Claude Code session. A Thread still answering when DevTools stopped comes back failed, and can be retried. Each Thread has a kind its asker names (Story asks `story`, the Chat `chat`), and the Agent lists and clears Threads by folder and kind: Story and the Chat each have a Clear button that, once confirmed, deletes their own Threads in the Worktree. Breaking: the Agent RPC's `ask` and `threads` take a `kind`, `ask` can fail with `AgentError` reason `unsaved`, and `clear` is new.

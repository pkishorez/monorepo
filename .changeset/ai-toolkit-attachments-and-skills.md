---
'@kestack/ai-toolkit': patch
---

Messages carry files. `startSession` and `send` now require `attachments` (an empty array for none), each `{ name, mime, data }` with base64 data. Images up to 5 MB (png, jpeg, gif, webp) go to the agent as images; any other file is saved under `~/.ai-toolkit/attachments/<sessionId>/` and named in the message text as `Attached file: <path> (<mime>)`. `turnStarted` parts list them. `skills { projectId, harness }` lists the Skills an agent offers in a project, and `/name` in a message invokes one on either agent; Codex lists each Skill name once. `send` also takes `model` and `settings`, which change the Session from that Turn on; settings a message leaves out keep their value.

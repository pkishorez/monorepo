---
'@kestack/connect': patch
---

A stop tells the agent what it cut off, and a cancel stops everything.

**New**

- What the agent writes between Turns is stored as it comes, in the Session's latest Turn.
- A Session record is v3, with the Background Jobs it last had. A restart Resumes a Session that had jobs running, as it did one with a Turn running, with a prompt that names each Turn, subagent and command cut off. A message after the agent closed with jobs running tells it of them first.
- A cancel also stops every Background Job, whether a Turn runs or not.

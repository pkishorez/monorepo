---
'@kestack/connect': patch
---

A Session can be given a Title of the user's own.

**Added**

- `setTitle` on the code Plugin gives a Session the Title given, trimmed, and answers with the Title it keeps. One left blank keeps the Title it had. A Title given before the first one is written stops it from being written, and a new Worktree's branch keeps its first name.
- `TITLE_MAX`, the longest Title that can be given: 200 characters.

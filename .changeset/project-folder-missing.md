---
'@kestack/connect': patch
---

A Project says whether its folder is there: `folder` is `'present'` or `'missing'`, as its Machine last found it. The Machine looks as it starts, every minute, and at once when a Turn fails or a Project's Skills cannot be listed, and writes the Project only when that changes. A Project stored before reads as present.

`ProjectValue` and `SessionValue`, the replies of `addProject`, `startSession` and `forkSession`, are now each record's versioned schema, so an App reads an older Connect's reply as it is now rather than refusing it.

This is a breaking change. Projects are now v2 records: an App older than this release stops seeing Project changes until it is reloaded or updated, and once this Connect has written v2 Projects an older Connect cannot be rolled back to. Install the latest Connect.

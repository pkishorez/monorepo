---
'@kestack/connect': patch
---

A Project says whether its folder is there: `folder` is `'present'` or `'missing'`, as its Machine last found it. The Machine looks as it starts, every minute, and at once when a Turn fails or a Project's Skills cannot be listed, and writes the Project only when that changes. A Project stored before reads as present.

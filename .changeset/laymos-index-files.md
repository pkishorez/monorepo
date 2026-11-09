---
'laymos': patch
---

A config can name more index files, so a folder whose entry is a framework's route file is a Module without a placeholder `index.ts`.

**Added**

- `indexFiles`: file names that count as an index file beside `index.ts`, `index.tsx` and the other built-in ones, such as `["index.page.tsx", "index.page.ts"]` for a Next.js app whose `pageExtensions` name route files so. A folder holding one is a Module and the file is its Index; a built-in index file in the same folder is the Index instead. Each entry is a bare file name; a path is rejected.

---
'@kestack/auth-toolkit': patch
---

The Auth Worker's pages use the Theme every kstack app shares (`@kestack/web-theme`): the same colours, Inter in place of the system font, and the same `kui-theme` cookie, so a Theme picked in an app under the Shared Cookie Domain holds on the sign-in pages and the other way round. A choice saved under the old `theme` cookie is kept. The worker no longer reads the Theme into `PagesContext`; the pages' head script sets it before the first paint.

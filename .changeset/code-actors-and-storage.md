---
'code': patch
---

The app's folders now match its Actor tree, and the device keeps one database per level: `code:device`, `code:account:<accountId>` and one per Connection. Signed-out Accounts and unlisted Connections are pruned.

Breaking: the old databases are not migrated; delete them by hand.

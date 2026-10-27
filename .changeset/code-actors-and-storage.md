---
'code': patch
---

The app's actors and storage now tell one story: the folder tree is the actor tree (the root's Account step, Machines, Frame with its tools, and the pages), and what the device keeps is one database per place in it, `code:device`, `code:account:<accountId>` and one per Machine under it, each table Local, Cache or Sync. An Account no longer signed in, or a Machine no longer listed, is pruned with all under it once the check answers. Settings › Machines is one card per Machine holding its accounts, Speech to Text and Projects. Breaking: the old databases (`code:accounts`, `code:kept`, `code:drafts`, `replica:*` and the old `code:device`) are not moved; delete them by hand.

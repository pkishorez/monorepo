---
'@kestack/connect': patch
---

A Heartbeat that crashes no longer stops the ones after it.

**Fixed**

- A Report that crashed, such as one Cloud Connect failed with a `DatabaseError`, is logged as not sent, and the next Heartbeat tries again. Before, it ended the Heartbeat for good, and the Connection showed down until `ke-connect` was restarted.

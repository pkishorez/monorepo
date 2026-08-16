---
'@pkishorez/whatever': patch
---

Initial release of the `whatever` CLI.

`whatever code serve` runs the coding-agent package over a WebSocket RPC server,
backed by SQLite. `@pkishorez/code` is bundled into the published output rather
than resolved at install time.

Published under the `@pkishorez` scope because the unscoped `whatever` name has
been taken on npm since 2014. The installed binary is still `whatever`.

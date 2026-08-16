---
'@pkishorez/whatever': patch
---

Initial release of the `whatever` CLI.

The package is published as `@pkishorez/whatever`; the unscoped `whatever` name
has been taken on npm since 2014 and is not available. The installed binary is
still `whatever`, so nothing about using the CLI changes.

`whatever code serve` runs the coding-agent package over a WebSocket RPC server
with a layered architecture, backed by a SQLite-backed database service and a
coding-agent contract with its own domain entities. `@pkishorez/code` is bundled
into the published output rather than resolved at install time.

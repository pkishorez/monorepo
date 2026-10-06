# @kstackz/lotel

## 0.0.12

### Patch Changes

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  Receives OpenTelemetry spans and logs over OTLP, stores them in SQLite, and serves them back over RPC. It is a library, not a server; DevTools hosts it. You need it to keep local telemetry somewhere a UI can read and sync.

- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`63ff114`](https://github.com/pkishorez/monorepo/commit/63ff114e32f517d4f58873b6ea4809a137744eb6)]:
  - @kstackz/std-toolkit@0.0.12

# @kestack/ai-toolkit

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - ai-toolkit is now the harness and nothing more: its doors are `contract`, `harness`, `harness/fake`, `speech` and `speech/fake`.

  - Breaking: the engine, the Machine, its CLI and the `api`, `client`, `server` and `machines` doors move to `@kestack/connect`.
  - An Agent is plain Effects (`HarnessSession` is `Agent`, `Titler` is `OneShotPrompt`), with forks, asks, steers, attachments, Skills, Background Jobs and per-login model lists.
  - Text and reasoning stream in sentence-sized chunks, and Claude runs the Claude Code installed on PATH when there is one.
  - Speech to Text runs Parakeet on the Machine, downloaded from Hugging Face.

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/kabuki@0.0.3
  - @kestack/std-toolkit@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.2

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Moves to stable Effect 4: the `effect` peer is now `^4.0.0`. ai-toolkit's `makePlaygroundSync` takes `store` instead of `platform`.
- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/std-toolkit@0.0.1

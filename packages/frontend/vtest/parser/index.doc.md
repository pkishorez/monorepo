# Parser

A toy tokenizer for arithmetic expressions over integers. This module
exists for two reasons:

1. It's a small, real grammar that exercises the lexer-style code paths
   we want examples of in the codebase.
2. Its test bodies are **deliberately gnarly** — template literals with
   `${}` interpolation, nested arrow functions, single- and double-quoted
   strings containing `(`, inline comments — so they double as a stress
   test for the docs **snippet extractor** in `@monorepo/vtest`.

## Modules

| Module     | Role                                          |
| ---------- | --------------------------------------------- |
| `tokenize` | Turns a source string into an array of tokens |

## Why this lives here

Most utility folders ship _functions_; this one also ships a
_specification_. If you're looking at it because a docs page is missing
its snippet, the bug is almost certainly in the reporter's call-snippet
extractor — open `packages/vtest/src/reporter.ts` and check
`extractCallSnippet`. The `failure modes` suite pins down inputs that
historically broke it.

> This is the only module under `vtest/` that has a meta-purpose. Treat
> it as a fixture, not as production code.

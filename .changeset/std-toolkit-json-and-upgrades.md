---
'@kestack/std-toolkit': patch
'@kestack/rpc-toolkit': patch
'@kestack/ai-toolkit': patch
'@kestack/devtools': patch
---

std-toolkit refuses plain `Schema.Number` fields when a schema is built (use `Schema.Finite` or `Schema.Int`) and any encoded value JSON cannot hold unchanged on every encode, and adds `expectUpgradable` in `@kestack/std-toolkit/eschema/testing`. `expectTableSnapshot` becomes `expectTableShippable`, the one test a table needs: it also checks that every stored version of every schema the table reaches upgrades with its key intact, `vitest -u` no longer accepts a breaking change, and a person accepts one by naming it in `acceptBreaking`. Adding or tightening a check on a shipped version is now breaking. A table write that cannot be encoded fails with `EncodeFailed` instead of `DecodeFailed`. rpc-toolkit, ai-toolkit, and devtools store their numbers as `Schema.Finite`, and alchemy-console uses `expectTableShippable`.

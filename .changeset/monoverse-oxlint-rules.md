---
'@kestack/monoverse': patch
---

Monoverse also holds the oxlint rules the code follows, beside its folder rules.

**Added**

- `@kestack/monoverse/oxlint`: an oxlint JS plugin, `monoverse`, and `rules`, every oxlint rule this monorepo turns on, to spread into a lint config.
- `monoverse/no-comments`: reports every comment except the ones tools read: `oxlint-disable…` naming its rules with a reason after `--`, `@ts-expect-error`, `/// <reference>`, bundler hints and a shebang. It has no autofix and cannot be turned off.
- `rules` also turns on `typescript/ban-ts-comment`, `unicorn/no-abusive-eslint-disable` and `react/jsx-no-comment-textnodes`.
- `docs/lint-rules.md`: why each rule is on, and which were weighed and left off.

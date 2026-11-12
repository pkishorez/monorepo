---
'@kestack/std-toolkit': patch
'@kestack/web-platform': patch
'@kestack/auth-toolkit': patch
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

Runs on Kabuki's new Runtime and declared `provides`.

**Added**

- `Replicas.capabilities`, from `@kestack/std-toolkit`, and `CurrentAccount.capabilities`, from `@kestack/web-platform`: every Capability their Layer builds, to name in a page's `provides`: `provides: { capabilities: Replicas.capabilities, layer: () => Replicas.layer }`.

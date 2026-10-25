---
'@kestack/ai-toolkit': patch
---

The harnesses run the Claude Code and Codex the user installed, as one of their logins, and the package ships no agent of its own.

- Breaking: `HarnessBinaries` is `HarnessAccount`: the `binary` and `configFolder` (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`) one call runs as, so two logins of one harness run side by side. `binaryAt` takes an account, and `Models` asks each account for its own models.
- Breaking: `@openai/codex` is no longer a dependency; Codex runs `codex` from PATH, and Claude Code no longer falls back to the SDK's own binary. A harness that is not installed says how to install it.
- The Claude Agent SDK's JavaScript ships in `dist/vendor`, so npm no longer downloads its 270 MB binary.
- Speech to Text's runtime, `sherpa-onnx-node`, is fetched from the npm registry and checked when Speech to Text is switched on, instead of being a dependency.

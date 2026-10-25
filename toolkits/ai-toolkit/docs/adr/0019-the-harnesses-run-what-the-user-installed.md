# The harnesses run what the user installed, and ship nothing of their own

ai-toolkit no longer brings any agent with it. Claude Code runs the `claude` the user installed (`AI_TOOLKIT_CLAUDE`, else `claude` on PATH), and Codex runs `codex` from PATH, each unless a Harness Account names another binary. `@openai/codex` is no longer a dependency. The Claude Agent SDK is still how the harness talks to Claude Code, but its JavaScript (`sdk.mjs`, one file that imports only Node's own modules) is copied into `dist/vendor` at build time and the SDK is a devDependency, so npm never installs the SDK's optional platform packages. T3 Code does the same. Speech to Text's runtime, `sherpa-onnx-node` and its native addon, is fetched from the npm registry into the model's folder when Speech to Text is switched on, checked against the registry's sha512, and deleted with the model when it is switched off. A first `npx @kestack/connect` went from about 940 MB to what the package itself needs.

Every harness call runs as a Harness Account: a binary, or none for the one on PATH, and a config folder, or none for the harness's own. The account's folder is given to the process as `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, so two logins of one harness, such as a work Claude beside a personal one, run side by side in one process. The caller gives the account with each call as the `HarnessAccount` service; which accounts there are is the caller's business. The Agent SDK's `forkSession` reads the config folder from its own process's environment, so a Claude fork runs in a short Node child given the account's environment.

## Considered options

- **Keep the agents as dependencies, prefer the installed ones.** Rejected: npm still downloads them, 346 MB for Codex and 273 MB for Claude Code on macOS, before the first run.
- **Run each account's agent through the user's login shell, so their shell aliases work as written.** Rejected: slower to start, depends on the shell's startup files, and cannot be checked before it is saved. An alias such as `CLAUDE_CONFIG_DIR=~/.claude-work claude` is a binary and a config folder, which is what an account holds.
- **Talk to Claude Code over its stream-json protocol directly, without the SDK.** Rejected for now: the SDK is most of the Claude harness, and vendoring it removes the download at no cost to the code.
- **Fetch the SDK's JavaScript at runtime, as Speech to Text's runtime is.** Rejected: every Claude user needs it, so it may as well ship.

## Consequences

- A Machine without Claude Code or Codex installed reports the harness as not running, with how to install it, and offers it for no new Session.
- The vendored SDK carries Anthropic's license (`dist/vendor/claude-agent-sdk/LICENSE.md`), not this package's.
- The SDK and the app-server protocol are each built against one version, while the user's agents update on their own; see the TODO in [CONTEXT.md](../../CONTEXT.md).
- A Machine whose Speech to Text model was downloaded before this keeps the model and fetches only the runtime, the next time it starts with Speech to Text on.

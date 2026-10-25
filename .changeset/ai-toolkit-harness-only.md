---
'@kestack/ai-toolkit': patch
---

An Agent is plain Effects; One-shot Prompt replaces Titler; HarnessSession is Agent. `OpenConfig` is `AgentConfig`, `Titler` and `codexTitler` are `OneShotPrompt` and `codexOneShot`, and Harness Binaries are checked here (`binaryAt`, `checkBinary`, `InvalidBinary`) and kept by the caller. The fake harness's `title` option is `oneShot`, and it records `prompts`.

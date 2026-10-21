# TODO

- [ ] Make the web-platform PWA Worker RPC test less timing-sensitive.
      `platforms/web-platform/src/pwa/rpc/client/tests/client.test.ts`, "treats a page
      that clients.get no longer finds as disconnected", waits a fixed
      `Effect.sleep('100 millis')` before asserting `ticksInterrupted` is 1. Under
      full-suite load (`pnpm test`) the tick sometimes has not been interrupted
      yet and the test fails; it passes when run alone. Use a test clock or wait
      on the interruption itself instead of a fixed sleep.
- [ ] Rewind a session N turns (files too) — Claude rewindFiles / Codex thread/revert.
- [ ] ai: a tool call that left a Background Job running reads "Stopped" in the
      transcript once its turn ends. Codex's background terminal knows its
      `itemId`; carry the tool call id on the Background Job so the app can
      show the call as running in the background until the job ends.
- [ ] ai-toolkit: when Claude Code exits while a Session is idle, its Background
      Jobs clear, but the engine only finds the agent gone on the next Turn
      (which then fails and reopens it). Let a `HarnessSession` say it ended
      so the Session drops it at once.
- [ ] ai-toolkit: when the server dies without shutting Codex down, Codex
      exits as its input ends, but a command it started and does not stop
      (one that ignores SIGTERM, or left its process group) keeps running.
      Track what each Session's agents started and sweep it on the next start.
- [ ] ai-toolkit: `docs/turn-flow.md` and ADRs 0001–0010 describe the old Run
      and AI Table design. Mark the ADRs superseded and rewrite or drop the
      turn flow doc.
- [ ] ai: the `/btw` answer popover covers the end of the transcript; leave room
      for it or scroll the last turn above it.

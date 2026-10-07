# TODO

- [ ] Make the web-toolkit PWA Worker RPC test less timing-sensitive.
      `toolkits/web-toolkit/src/pwa/rpc/client/tests/client.test.ts`, "treats a page
      that clients.get no longer finds as disconnected", waits a fixed
      `Effect.sleep('100 millis')` before asserting `ticksInterrupted` is 1. Under
      full-suite load (`pnpm test`) the tick sometimes has not been interrupted
      yet and the test fails; it passes when run alone. Use a test clock or wait
      on the interruption itself instead of a fixed sleep.

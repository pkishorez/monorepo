# worker-rpc scenarios (/rpc)

Target https://pr57-pwa.kishore.app, Build ID `f3560931227cac18`, headless Chrome 151 (agent-browser session `worker-rpc`, fresh profile).
Tools: page-side trace of every Tab Client envelope (wrapped `ServiceWorker.prototype.postMessage` + `message` listener), worker-side trace (wrapped `Client.prototype.postMessage` via CDP `Runtime.evaluate` on the SW target), CDP `ServiceWorker.stopAllWorkers`.

| #   | Scenario                                     | Verdict  |
| --- | -------------------------------------------- | -------- |
| 1   | Unary Echo round-trip, latency               | PASS     |
| 2   | WorkerInfo Build ID + start time             | PASS     |
| 3   | Ticks streams; unsubscribe stops server side | PASS     |
| 4   | Worker stopped while idle, then Echo         | **FAIL** |
| 5   | Worker stopped mid-stream                    | PARTIAL  |
| 6   | Version Skew via `?fakeBuildId=`             | PASS     |
| 7   | 3 tabs, close one                            | PASS     |
| 8   | Call before controller (fresh profile)       | PASS     |
| 9   | Long idle (~75 s) then call                  | PARTIAL  |

## Test-harness warning (affects anyone stopping the worker)

agent-browser auto-attaches to service worker targets with wait-for-debugger. After `stopAllWorkers`, the next worker start is **paused before its script runs**, so every navigation and RPC hangs (a page load hung >100 s). Fix for testing: keep a CDP client that calls `Runtime.runIfWaitingForDebugger` on the SW target (script used: `/tmp/pwa/rpcgrp/resumer.mjs`, polls every 300 ms). All results below for 4 and 5 were taken with it running. Not an app bug.

## Details

**1. Echo.** 20 sequential calls, click-to-DOM-update: min 4.2 ms, median 5.8 ms, max 6.1 ms. No errors.

**2. WorkerInfo.** `build f3560931227cac18, started 2026-09-26T21:00:10.731Z`; meta `pwa-toolkit:build-id` = `f3560931227cac18` (equal).

**3. Ticks.** Chunks 1..5 one per second, status `done`. The page has no cancel button, so unsubscribe was done by leaving /rpc (SPA link to `/`, which closes the Tab Client scope and posts CLOSE). Started 21:00:57, left at 21:00:59.47: worker sent Chunk 1 (57.87) and Chunk 2 (58.88), then nothing (3-5 never sent). Handler fiber interruption itself is not observable (handler does not log), but the server stops sending.

**4. Stopped while idle → FAIL.** Steps: Echo + WorkerInfo OK (started 21:06:41.231Z); `stopAllWorkers`; 2 s later Echo.
Expected: worker wakes, the call succeeds.
Observed: the call fails after 260 ms with `RpcClientError: WorkerReceiveError: The Worker Server no longer knows this Tab Client; the service worker was restarted`. Tab Client reconnects 1 s later; next calls succeed and WorkerInfo shows a new start time (21:06:50.260Z).
Trace:

```
06:50.007 TX MESSAGE 3a8b7d Request 2 Echo
06:50.262 RX UNKNOWN_CONNECTION 3a8b7d
06:51.263 TX CONNECT bf27be / RX READY bf27be
06:51.896 TX Request 4 Echo -> RX Exit 4   (OK)
```

Root cause: the Tab Client keeps its connection id across worker restarts. The new worker instance does not know it, and `runner-platform.ts` (`case 'MESSAGE': if (connection === undefined) return reply('UNKNOWN_CONNECTION')`) rejects it; `platform.ts` then fails the connection, and Effect's worker protocol fails every request on it, including the brand-new one that nothing had lost. So after any idle stop (which browsers do routinely after ~30 s), the first call of each tab fails. The TabClient doc only promises failure for calls "in flight" when the worker stops.
Suggested fix: let a fresh worker adopt a connection that has nothing to lose. Tab side (`makePort.post` in `client/platform.ts`): add `open: port.inFlight.size` (count before this request) to MESSAGE envelopes. Server side (`runner-platform.ts`, MESSAGE with unknown connection): if the Build ID matches (`checkVersionSkew`) and the tab reports no other open calls and the message is a `Request`, call `connections.open(tab, connectionId)` and handle it; otherwise reply UNKNOWN_CONNECTION as now. This is safe from duplicates: a message event reaches exactly one worker instance. Add a test in `client.test.ts`: restart the fake worker, then a unary call succeeds.

**5. Stopped mid-stream → PARTIAL.** Ticks started 21:07:15.45, stop at 21:07:18.04 after chunks 1,2. Page shows `failed [1, 2]` with `RpcClientError ... service worker was restarted` 7.4 s after start (~4.8 s after the stop: detection waits for the 5 s liveness PING, which wakes the worker and gets UNKNOWN_CONNECTION). Reconnect CONNECT/READY 1.0 s after the error. No stuck state: pressing Start again streams 1..5 from the start (Subscription Restart semantics). Partial because the page does not retry the stream itself (no `Stream.retry` in `routes/rpc.tsx`), so an automatic resume can't be shown; also the loss takes up to the liveness interval to surface. Minor: "Last error" readout is never cleared after later successes. Screenshot `screenshots/worker-rpc-5.png`.

**6. Version Skew → PASS.** `/rpc?fakeBuildId=xyz` (and `=other`): client `ready`, Echo / WorkerInfo / Ticks all fail with `VersionSkew: tab xyz, worker f3560931227cac18`, shown in "Last error"; Ticks `failed`. Plain `/rpc`: all calls succeed, no error. Screenshot `screenshots/worker-rpc-6.png`.

**7. Three tabs → PASS.** Streams started in t1/t2/t3 within 80 ms; t2 closed at ~21:08:26. Worker log: client 7b2dfbd5 (t2) got Chunk 1, 2 then nothing; aab7c76d and b60e91b0 got 1..5 + Exit; t1 and t3 both show `done [1, 2, 3, 4, 5]`.

**8. Call before controller → PASS.** Fresh profile, first load: at first eval `controller=false`, Tab Client already `ready`, Echo enabled; Echo clicked with no controller, result arrived after 1226 ms with `controller=true`, no error.

**9. Long idle → PARTIAL.** Idle 75 s (my CDP helpers detached): worker still `running`, same start time 21:07:22.811Z; Echo then succeeded in 7 ms. Headless Chrome did not stop the worker, most likely because agent-browser keeps DevTools attached to it (DevTools-attached workers are exempt from the idle timeout). The case where the browser does stop it is scenario 4, which fails the first call.

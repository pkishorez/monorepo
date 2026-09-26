# retest-1: fixes from round 1

Target: https://pr57-pwa.kishore.app, build label `36272566150-1` (GitHub run for head `57a42383f`, success), Build ID `593772b3c3104e05`, preset `app`. Date: 2026-09-27.
Browser: agent-browser headless Chrome. Session `retest-1` for desktop, session `retest-1-m` for mobile emulation. Both used fresh profiles.
Offline means CDP `Network.emulateNetworkConditions` on every page and service worker target, with auto-attach so restarted workers are offline too (`/tmp/pwa/r1/net.mjs`). Workers were stopped with CDP `ServiceWorker.stopAllWorkers` (`/tmp/pwa/r1/stopsw.mjs`). While workers were being stopped, `/tmp/pwa/r1/resumer.mjs` kept releasing the paused worker with `Runtime.runIfWaitingForDebugger`.

| #   | Retest                                                       | Before  | Now  |
| --- | ------------------------------------------------------------ | ------- | ---- |
| 1   | Offline Fallback (offline-cache 2)                           | PARTIAL | PASS |
| 2a  | Worker RPC 4: stopped while idle, then Echo                  | FAIL    | PASS |
| 2b  | Worker RPC 5: stopped mid-stream, Retrying Ticks             | PARTIAL | PASS |
| 2c  | Stop buttons end streams                                     | new     | PASS |
| 3   | InstallPrompt sheet on mobile, OfflineIndicator stacking     | PARTIAL | PASS |
| 4   | Regression: first visit controlled, cold start offline, Echo | PASS    | PASS |

## 1. Offline Fallback — PASS

Steps: went offline, deleted `/_shell` from `pwa-toolkit:precache:593772b3c3104e05` in page JS (the only HTML entries were `/_shell` and `/offline`), then navigated to `/status`.

- The final URL was `/offline?from=%2Fstatus`. The navigation entry was the `/offline` URL, so the worker redirected. The page showed the heading "You are offline" and the Try again button. The Status route did not render, so the round-1 hydration problem is gone.
- The query string is kept: `/data?q=1` ended on `/offline?from=%2Fdata%3Fq%3D1`.
- Try again while still offline: the worker redirected back to the same `/offline?from=…`, which is correct.
- Try again after going online: the page landed on `/status` with heading "Status" and a network `transferSize` of 14394.
- Crafted values: `from=//evil.com`, `https:%2F%2Fevil.com`, `%2F%5Cevil.com` (`/\evil.com`) and `javascript:alert(1)`. For each one, Try again kept the URL on `pr57-pwa.kishore.app` and reloaded the page (a window marker was cleared). None left the origin. `retryTarget` resolves the value against `location.origin` and rejects any other origin.

Still open from round 1 (minor, not retested as a fix): a precache entry that has been deleted is not written back when the worker next serves it. I put `/_shell` back by hand with `cache.add`.

## 2a. Worker RPC 4: idle stop, then Echo — PASS

Steps: on `/rpc`, called Echo and WorkerInfo (worker started `21:23:32.446Z`), stopped all workers, waited, then called Echo.

| Run | Wait after stop | First Echo after stop | Last error | New WorkerInfo start |
| --- | --------------- | --------------------- | ---------- | -------------------- |
| 1   | 2 s             | OK, 269 ms            | none       | `21:24:41.477Z`      |
| 2   | 5 s             | OK, 157 ms            | none       | `21:24:52.324Z`      |
| 3   | 5 s             | OK, 226 ms            | none       | `21:24:59.258Z`      |

The extra time on the first call is the worker starting up. No `UNKNOWN_CONNECTION` error reached the page.

## 2b. Worker RPC 5: Retrying Ticks, stopped mid-stream — PASS

Steps: started Retrying Ticks (20 ticks), stopped the worker about 3.3 s later, after tick 3.
Timeline (ms from Start):

```
3037  streaming subs=1 [1, 2, 3]
4191  restarting subs=1 [1, 2, 3]  err=RpcClientError: WorkerReceiveError: The Worker Server no longer knows this Tab Client…
5201  streaming subs=2 [—]
6216  streaming subs=2 [1]
...
25360 streaming subs=2 [1 … 20]
25380 done subs=2
```

- The loss was noticed about 0.9 s after the stop. In round 1 it took about 4.8 s.
- The stream subscribed again 1 s later and finished all 20 ticks, starting over from 1 (Subscription Restart).
- Minor, unchanged from round 1: "Last error" keeps showing the restart error after the stream succeeds.

## 2c. Stop buttons — PASS

- On both Ticks and Retrying Ticks, Stop is disabled while idle.
- After 2 ticks, Stop changed the status to `stopped`. 3.5 s later there were still only `[1, 2]` ticks, and Stop was disabled again.
- Worker-side trace (wrapped `Client.prototype.postMessage`): Chunk 1 at `17.598`, Chunk 2 at `18.604`, and `Exit` at `19.093`, the same millisecond Stop was clicked. Nothing was sent after that, so the worker's handler really ends.
- Pressing Start during a stream restarts cleanly (`streaming subs=1 [1, 2]`). The old stream's `stopped` status did not overwrite the new stream's status.

## 3. InstallPrompt sheet on mobile — PASS

Pixel 7 emulation (412 px), real `beforeinstallprompt`, with agent-browser's offline toggle on:

- The sheet's controls are "Not now" 380x44 and "Install" 380x44. The 32 px close (X) button is gone.
- The iPhone 14 emulation (390 px, ManualIos) shows only "Got it", 358x44.
- OfflineIndicator: the "You're offline" pill (at 144,8, size 122x28) is in a layer with z-index 60, and the sheet overlay has z-index 50. A hit test at the pill's center finds the indicator. It shows sharp above the blurred backdrop, and nothing scrolls sideways (overflow 0). Screenshot: `screenshots/retest-1-3.png`.

## 4. Regression — PASS

- First visit, fresh profile, `/status`: navigation type `navigate` (no reload), controller `/sw.js`, active `activated`. The meta Build ID equals the precache name, which has 39 entries.
- Cold start offline on `/`: went offline and stopped all workers, then opened `/`. The home page rendered with `transferSize` 0 and `workerStart` > 0, and `fetch('/api/time/network-only')` gave "Failed to fetch".
- Echo: the first call returned in 8 ms with no error.

import { Effect, Layer, ManagedRuntime } from 'effect';
import { makeDevTelemetryLayer } from '@pkishorez/effect-tracer/telemetry/dev-telemetry';
import { FlowTelemetry } from '@pkishorez/flow';
import { browserSide, flowId, makeFlow, serverSide } from './flow.js';

/**
 * Runs the demo Flow against a running DevTools. Defaults to the Vite dev
 * server, which proxies `/rpc` to the local DevTools process; override with
 * `FLOW_ENDPOINT` when DevTools runs elsewhere.
 *
 *   pnpm dev            # in devtools/devtools, then
 *   pnpm flow:demo      # open http://127.0.0.1:5173/flow
 */
export const DEFAULT_DEVTOOLS_URL = 'http://127.0.0.1:5173';

const endpoint = process.env.FLOW_ENDPOINT ?? DEFAULT_DEVTOOLS_URL;

// Each origin sends its Flow Entries and its traces to the same DevTools, so
// an Entry's trace link opens the span it ran in.
const runtimeFor = (origin: string) =>
  ManagedRuntime.make(
    Layer.merge(
      FlowTelemetry.layer({ endpoint, origin }),
      makeDevTelemetryLayer({ endpoint, serviceName: origin }),
    ),
  );

const browser = runtimeFor('browser:alice');
const server = runtimeFor('server:api-1');

// Both origins write the same Flow id; nothing is shared but the id and the
// message token the browser hands the server.
const browserFlow = makeFlow();
const serverFlow = makeFlow();

const start = Date.now();
console.log(`flow ${flowId} → ${endpoint}`);

const { session, submit } = await browser.runPromise(
  browserSide(browserFlow).begin,
);
await server.runPromise(
  serverSide(serverFlow, { submit }).pipe(Effect.withSpan('handle-order')),
);
await browser.runPromise(browserSide(browserFlow).finish(session));

// Disposing drains each remote sink's last batch.
await Promise.all([browser.dispose(), server.dispose()]);
console.log(
  `done in ${Date.now() - start} ms · open ${endpoint}/flow?flow=${encodeURIComponent(flowId)}`,
);

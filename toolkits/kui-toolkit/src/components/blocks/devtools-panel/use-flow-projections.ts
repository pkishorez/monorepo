import { useEffect, useState } from 'react';
import { Effect, Layer, ManagedRuntime, Stream } from 'effect';
import {
  FlowTelemetry,
  groupJournals,
  projectJournal,
  type Entry,
  type FlowTelemetryService,
  type Projection,
} from '@pkishorez/flow';
import { FlowRpcClient, makeFlowRpcClientLayer } from '@pkishorez/flow/client';

const REMOTE_POLL_MS = 500;
const REMOTE_PAGE = 200;

/** The one thing the panel needs from a host: a runtime it can ask and fork in. */
export interface PanelRuntime {
  readonly runSync: <A, E>(effect: Effect.Effect<A, E, never>) => A;
}

export interface FlowProjections {
  /** Where the Flows come from, so the panel can explain an empty list. */
  readonly source: FlowTelemetryService['kind'];
  readonly flows: readonly Projection[];
}

const readTelemetry = (runtime: PanelRuntime): FlowTelemetryService =>
  runtime.runSync(
    Effect.gen(function* () {
      return yield* FlowTelemetry;
    }),
  );

const projectAll = (entries: Iterable<Entry>) =>
  [...groupJournals(entries).values()].map(projectJournal);

/**
 * Follows the Flows a runtime records. A memory sink is observed directly;
 * a remote sink is read back from the Flow Store it forwards to; without a
 * sink the list stays empty and says why.
 */
export function useFlowProjections(runtime: PanelRuntime): FlowProjections {
  const [telemetry] = useState(() => readTelemetry(runtime));
  const [flows, setFlows] = useState<readonly Projection[]>(() =>
    telemetry.kind === 'memory' ? telemetry.journals().map(projectJournal) : [],
  );

  useEffect(() => {
    if (telemetry.kind === 'memory') {
      const refresh = () => setFlows(telemetry.journals().map(projectJournal));
      refresh();
      const follower = ManagedRuntime.make(Layer.empty);
      const fiber = follower.runFork(
        Stream.runForEach(telemetry.changes, () => Effect.sync(refresh)),
      );
      return () => {
        fiber.interruptUnsafe();
        void follower.dispose();
      };
    }
    if (telemetry.kind === 'remote') {
      const client = ManagedRuntime.make(
        makeFlowRpcClientLayer({ endpoint: telemetry.endpoint }),
      );
      const entries = new Map<string, Entry>();
      let cursor: string | null = null;
      let active = true;
      const poll = async () => {
        while (active) {
          try {
            const { items } = await client.runPromise(
              Effect.gen(function* () {
                const rpc = yield* FlowRpcClient;
                return yield* rpc.ListFlowEntries({
                  _u: { '>': cursor },
                  limit: REMOTE_PAGE,
                });
              }),
            );
            if (items.length > 0) {
              for (const { entry, _u } of items) {
                entries.set(entry.id, entry);
                cursor = _u;
              }
              setFlows(projectAll(entries.values()));
              if (items.length === REMOTE_PAGE) continue;
            }
          } catch {
            // The store is unreachable; keep trying at the poll cadence.
          }
          await new Promise((resolve) => setTimeout(resolve, REMOTE_POLL_MS));
        }
      };
      void poll();
      return () => {
        active = false;
        void client.dispose();
      };
    }
    return undefined;
  }, [telemetry]);

  return { source: telemetry.kind, flows };
}

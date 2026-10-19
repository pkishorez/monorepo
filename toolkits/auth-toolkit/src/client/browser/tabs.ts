import { Effect, Schema } from 'effect';
import {
  type Peers,
  type Snapshot,
  SnapshotSchema,
} from '../accounts-layer/index.js';

const decode = Schema.decodeUnknownOption(SnapshotSchema);

/** Keeps this tab in step with the others: checks again when it becomes
 * visible, and a BroadcastChannel carries each new Snapshot to the other
 * tabs at once. Where there is no document or no BroadcastChannel, that part
 * is skipped. */
export const watchTabs =
  (channel: string) =>
  ({ check, apply }: Peers) =>
    Effect.gen(function* () {
      if (typeof document !== 'undefined') {
        const onVisibility = () => {
          if (document.visibilityState === 'visible') Effect.runFork(check);
        };
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            document.addEventListener('visibilitychange', onVisibility),
          ),
          () =>
            Effect.sync(() =>
              document.removeEventListener('visibilitychange', onVisibility),
            ),
        );
      }

      if (typeof BroadcastChannel === 'undefined') {
        return { announce: () => Effect.void };
      }
      const tabs = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const opened = new BroadcastChannel(channel);
          opened.onmessage = ({ data }: MessageEvent) => {
            const snapshot = decode(data);
            if (snapshot._tag === 'Some') Effect.runFork(apply(snapshot.value));
          };
          return opened;
        }),
        (opened) => Effect.sync(() => opened.close()),
      );
      return {
        announce: (snapshot: Snapshot) =>
          Effect.sync(() => tabs.postMessage(snapshot)),
      };
    });

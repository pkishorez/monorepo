import type { Tracker } from '../collection/registry/index.js';
import type { OutboxRuntime } from '../outbox/outbox/index.js';
import type { EffectRunner } from '../platform/effect-runner/index.js';
import type { SyncStore } from '../platform/sync-store/index.js';
import type { SyncFlow } from '../worker/sync-flow/index.js';

// Logout in place: stop every Worker and the Drainer, fail local Waiters, wipe
// the Sync Store, re-seed every tracked Collection, restart. The TanStack DB
// Collection objects the application holds stay the same.
export const makeReset =
  <R>(args: {
    runner: EffectRunner<R>;
    flow: SyncFlow;
    tracker: Tracker;
    store: SyncStore;
    outbox: OutboxRuntime | null;
    stopDrain: () => Promise<void>;
    startDrain: () => void;
  }) =>
  async (): Promise<void> => {
    await args.runner.runPromise(args.flow.sync.log('Reset'));
    await args.stopDrain();
    args.outbox?.rejectWaiters('the Std Sync was reset');
    const handles = args.tracker.all();
    for (const handle of handles) await args.runner.runPromise(handle.stop);
    await args.runner.runPromise(args.store.wipe());
    for (const handle of handles) await args.runner.runPromise(handle.restart);
    args.startDrain();
  };

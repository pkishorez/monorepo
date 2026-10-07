import * as Context from 'effect/Context';
import type * as Stream from 'effect/Stream';
import type { BuildId } from '../build/index.js';

interface WorkerHostService {
  readonly buildId: BuildId;
  /**
   * Every `message` event that is not a command, from worker
   * start. Listeners are registered synchronously at script start and events
   * are buffered until the first subscriber, so none are lost.
   */
  readonly messages: Stream.Stream<ExtendableMessageEvent>;
}

/**
 * What the service worker runtime offers the `layer` given to
 * `runServiceWorker`. Worker RPC's Worker Server builds on it.
 */
export class WorkerHost extends Context.Service<
  WorkerHost,
  WorkerHostService
>()('@kstackz/web-toolkit/pwa/WorkerHost') {}

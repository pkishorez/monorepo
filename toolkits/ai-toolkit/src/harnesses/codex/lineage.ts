import { isNotification, type Notification } from './app-server/index.js';

/**
 * Which sub-agent each Codex thread is. A sub-agent runs as its own thread;
 * the `collabAgentToolCall` item that spawned it names the thread in
 * `receiverThreadIds`, so the thread's agentId is that item's id. Spawns
 * inside a sub-agent work the same way, which makes the tree recursive.
 */
export interface Lineage {
  /** Learns from one notification; call it for every notification, in order. */
  readonly observe: (notification: Notification) => void;
  /** The agentId of a thread: undefined for the main thread. */
  readonly agentOf: (threadId: string) => string | undefined;
}

export const makeLineage = (mainThreadId: string): Lineage => {
  const spawnedBy = new Map<string, string>();
  return {
    observe: (notification) => {
      if (
        !isNotification(notification, 'item/started') &&
        !isNotification(notification, 'item/completed')
      )
        return;
      const { item } = notification.params;
      if (item.type !== 'collabAgentToolCall') return;
      // A spawn names its child first; any other collab call that reaches a
      // thread we have not met (one resumed after a restart) adopts it.
      for (const threadId of item.receiverThreadIds) {
        if (threadId === mainThreadId) continue;
        if (item.tool === 'spawnAgent' || !spawnedBy.has(threadId))
          spawnedBy.set(threadId, item.id);
      }
    },
    agentOf: (threadId) =>
      threadId === mainThreadId
        ? undefined
        : // A thread no call has named yet is still not the main agent.
          (spawnedBy.get(threadId) ?? threadId),
  };
};

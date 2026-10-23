import type { BackgroundJob } from '../../contract/index.js';
import {
  isNotification,
  type BackgroundTerminal,
  type CollabAgentStatus,
  type Notification,
} from '../app-server/index.js';

const TITLE_CHARS = 120;

/** Agent states that mean the sub-agent still works. */
const WORKING: ReadonlySet<CollabAgentStatus> = new Set([
  'pendingInit',
  'running',
]);

/** Thread statuses that mean a sub-agent will not finish its turn. */
const GONE = new Set(['notLoaded', 'systemError']);

interface SubAgent {
  title: string;
  readonly startedAt: number;
  /** Its current turn, to interrupt; known once the turn starts. */
  turnId: string | undefined;
  working: boolean;
}

/**
 * The sub-agents a session's threads have spawned, and which still work.
 * Fed every notification in order; a spawn's prompt is its title.
 */
export interface SubAgents {
  /** Learns from one notification; true when the working set changed. */
  readonly observe: (notification: Notification, now: number) => boolean;
  readonly jobs: () => ReadonlyArray<BackgroundJob>;
  /** The running turn of a working sub-agent thread. */
  readonly turnOf: (threadId: string) => string | undefined;
}

const oneLine = (text: string | null): string | undefined => {
  const line = text?.trim().split('\n')[0]?.trim();
  if (line === undefined || line === '') return undefined;
  return line.length > TITLE_CHARS
    ? `${line.slice(0, TITLE_CHARS - 1)}…`
    : line;
};

export const makeSubAgents = (mainThreadId: string): SubAgents => {
  const agents = new Map<string, SubAgent>();

  const agent = (threadId: string, now: number): SubAgent => {
    let known = agents.get(threadId);
    if (known === undefined) {
      known = {
        title: 'Sub-agent',
        startedAt: now,
        turnId: undefined,
        working: true,
      };
      agents.set(threadId, known);
    }
    return known;
  };

  const setWorking = (subAgent: SubAgent, working: boolean): boolean => {
    if (subAgent.working === working) return false;
    subAgent.working = working;
    return true;
  };

  return {
    observe: (notification, now) => {
      if (
        isNotification(notification, 'item/started') ||
        isNotification(notification, 'item/completed')
      ) {
        const { item } = notification.params;
        if (item.type !== 'collabAgentToolCall') return false;
        let changed = false;
        for (const threadId of item.receiverThreadIds) {
          if (threadId === mainThreadId) continue;
          const state = item.agentsStates[threadId];
          // Only a spawn, or a call that says how the agent is, makes it known.
          if (item.tool !== 'spawnAgent' && state === undefined) continue;
          changed ||= !agents.has(threadId);
          const subAgent = agent(threadId, now);
          if (item.tool === 'spawnAgent')
            subAgent.title = oneLine(item.prompt) ?? subAgent.title;
          if (state !== undefined)
            changed =
              setWorking(subAgent, WORKING.has(state.status)) || changed;
        }
        return changed;
      }
      const { threadId } = (notification.params ?? {}) as { threadId?: string };
      if (threadId === undefined || threadId === mainThreadId) return false;
      if (isNotification(notification, 'turn/started')) {
        const subAgent = agent(threadId, now);
        subAgent.turnId = notification.params.turn.id;
        return setWorking(subAgent, true);
      }
      const known = agents.get(threadId);
      if (known === undefined) return false;
      if (isNotification(notification, 'turn/completed')) {
        known.turnId = undefined;
        return setWorking(known, false);
      }
      if (notification.method === 'thread/status/changed') {
        const status = (notification.params as { status?: { type?: string } })
          .status?.type;
        if (status !== undefined && GONE.has(status))
          return setWorking(known, false);
      }
      return false;
    },
    jobs: () =>
      [...agents]
        .filter(([, subAgent]) => subAgent.working)
        .map(([threadId, subAgent]) => ({
          id: threadId,
          kind: 'agent',
          title: subAgent.title,
          startedAt: subAgent.startedAt,
        })),
    turnOf: (threadId) =>
      agents.get(threadId)?.working === true
        ? agents.get(threadId)?.turnId
        : undefined,
  };
};

/** Whether a notification may have started or ended a background terminal. */
export const touchesTerminals = (notification: Notification): boolean => {
  if (
    isNotification(notification, 'item/started') ||
    isNotification(notification, 'item/completed')
  )
    return notification.params.item.type === 'commandExecution';
  return (
    notification.method === 'turn/completed' ||
    notification.method === 'item/commandExecution/terminalInteraction'
  );
};

/** Background shells as jobs, each first seen at `seen`'s time for its id. */
export const terminalJobs = (
  terminals: ReadonlyArray<BackgroundTerminal>,
  seen: Map<string, number>,
  now: number,
): ReadonlyArray<BackgroundJob> => {
  const live = new Set(terminals.map((terminal) => terminal.processId));
  for (const id of seen.keys()) if (!live.has(id)) seen.delete(id);
  return terminals.map((terminal) => {
    if (!seen.has(terminal.processId)) seen.set(terminal.processId, now);
    return {
      id: terminal.processId,
      kind: 'shell',
      title: oneLine(terminal.command) ?? terminal.command,
      startedAt: seen.get(terminal.processId)!,
    };
  });
};

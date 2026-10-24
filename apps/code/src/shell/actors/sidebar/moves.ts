import type { Session } from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';
import type { Intent } from '../../moves/index.ts';

/*
 * Sessions put to Settle or un-Settle them, as the sidebar draws them:
 * where `Moves` says each goes, until the Session as synced agrees.
 */

type Going = typeof Intent.Type;

/** When a Session put Settled was Settled: after any real time. */
const PENDING = Number.MAX_SAFE_INTEGER - 2 ** 32;

const goingOf = (going: ReadonlyArray<Going>, session: OnMachine<Session>) =>
  going.find(
    ({ machineId, sessionId }) =>
      machineId === session.machineId && sessionId === session.id,
  );

/**
 * The Sessions as they show: one put Settled is Settled, the most recently
 * of all, a later one later still, and one put back is not.
 */
export const movedOf = (
  sessions: ReadonlyArray<OnMachine<Session>>,
  going: ReadonlyArray<Going>,
): ReadonlyArray<OnMachine<Session>> =>
  going.length === 0
    ? sessions
    : sessions.map((session) => {
        const move = goingOf(going, session);
        if (move === undefined || move.settled === (session.settledAt !== null))
          return session;
        return {
          ...session,
          settledAt: move.settled ? PENDING + move.n : null,
        };
      });

/** The Sessions with nothing left to ask whose synced Session agrees. */
export const doneOf = (
  sessions: ReadonlyArray<OnMachine<Session>>,
  going: ReadonlyArray<Going>,
) =>
  going.flatMap(({ machineId, sessionId, settled, idle }) => {
    if (!idle) return [];
    const session = sessions.find(
      (each) => each.machineId === machineId && each.id === sessionId,
    );
    const agrees =
      session === undefined || (session.settledAt !== null) === settled;
    return agrees ? [{ machineId, sessionId, settled }] : [];
  });

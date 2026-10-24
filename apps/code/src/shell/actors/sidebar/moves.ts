import type { Session } from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';

/*
 * Sessions swiped to Settle or un-Settle them, as the sidebar draws them:
 * already where they go, before their Machine has said so, and each Move
 * dropped once the Session as synced agrees.
 */

/** A Session swiped, and where it goes. */
export interface Move {
  readonly n: number;
  readonly machineId: string;
  readonly sessionId: string;
  readonly settled: boolean;
  readonly done: boolean;
}

const moveOf = (
  moving: ReadonlyArray<Move>,
  { machineId, id }: OnMachine<Session>,
) =>
  moving.find((move) => move.machineId === machineId && move.sessionId === id);

/** When a Session swiped to Settle was Settled: after any real time. */
const PENDING = Number.MAX_SAFE_INTEGER - 2 ** 32;

/**
 * The Sessions as they show: one swiped to Settle is Settled, the most
 * recently of all, a later swipe later still, and one swiped back is not.
 */
export const movedOf = (
  sessions: ReadonlyArray<OnMachine<Session>>,
  moving: ReadonlyArray<Move>,
): ReadonlyArray<OnMachine<Session>> =>
  moving.length === 0
    ? sessions
    : sessions.map((session) => {
        const move = moveOf(moving, session);
        if (move === undefined || move.settled === (session.settledAt !== null))
          return session;
        return {
          ...session,
          settledAt: move.settled ? PENDING + move.n : null,
        };
      });

/** The Moves done whose Session, as synced, is where they put it. */
export const seenOf = (
  sessions: ReadonlyArray<OnMachine<Session>>,
  moving: ReadonlyArray<Move>,
): ReadonlyArray<Move> =>
  moving.filter((move) => {
    if (!move.done) return false;
    const session = sessions.find(
      ({ machineId, id }) =>
        machineId === move.machineId && id === move.sessionId,
    );
    return (
      session === undefined || move.settled === (session.settledAt !== null)
    );
  });

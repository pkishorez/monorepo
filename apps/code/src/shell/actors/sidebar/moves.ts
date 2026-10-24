import type { Session } from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';

/*
 * Sessions swiped to Settle or un-Settle them, as the sidebar draws them:
 * already where the last swipe put them, before their Machine has said so.
 *
 * 1. Asked     a swipe, or its Undo: the Session shows where it goes, and
 *              that is one more result the synced Session must show.
 * 2. Done      its Machine took the last swipe.
 * 3. Synced    the Session as synced shows the next result it owes, in the
 *              order swiped. A result already there, or left from before
 *              an earlier swipe landed, is not taken for it: a Settle and
 *              its Undo owe "Settled", then "not Settled".
 *
 * A Move is dropped once its last swipe is done and every result it owes
 * has shown, so a late update from an earlier swipe never moves the row.
 */

/** A Session swiped, where its last swipe puts it, and what it waits for. */
export interface Move {
  /** Its last swipe's place in the order swiped. */
  readonly n: number;
  readonly machineId: string;
  readonly sessionId: string;
  /** Where its last swipe puts it. */
  readonly settled: boolean;
  /** Whether its Machine took the last swipe. */
  readonly done: boolean;
  /** The results the synced Session has still to show, in order. */
  readonly awaiting: ReadonlyArray<boolean>;
}

/** Where a swipe puts a Session. */
interface Swiped {
  readonly machineId: string;
  readonly sessionId: string;
  readonly settled: boolean;
}

const isOf =
  ({ machineId, sessionId }: Omit<Swiped, 'settled'>) =>
  (move: Move) =>
    move.machineId === machineId && move.sessionId === sessionId;

const moveOf = (
  moving: ReadonlyArray<Move>,
  { machineId, id }: OnMachine<Session>,
) => moving.find(isOf({ machineId, sessionId: id }));

// Kept while there is something left to hear.
const kept = (move: Move) => !move.done || move.awaiting.length > 0;

/** 1. Asked: the swipe numbered `n`, after whatever this Session awaits. */
export const askedOf = (
  moving: ReadonlyArray<Move>,
  swiped: Swiped,
  n: number,
): ReadonlyArray<Move> => {
  const { machineId, sessionId, settled } = swiped;
  const before = moving.find(isOf(swiped));
  return [
    ...moving.filter((move) => !isOf(swiped)(move)),
    {
      machineId,
      sessionId,
      settled,
      n,
      done: false,
      awaiting: [...(before?.awaiting ?? []), settled],
    },
  ];
};

/** 2. Done: its Machine took a swipe; only the last one counts. */
export const doneOf = (
  moving: ReadonlyArray<Move>,
  swiped: Swiped,
): ReadonlyArray<Move> =>
  moving
    .map((move) =>
      isOf(swiped)(move) && move.settled === swiped.settled
        ? { ...move, done: true }
        : move,
    )
    .filter(kept);

/** 3. Synced: the Session as synced shows `settled`, the next result owed. */
export const syncedOf = (
  moving: ReadonlyArray<Move>,
  swiped: Swiped,
): ReadonlyArray<Move> =>
  moving
    .map((move) =>
      isOf(swiped)(move) && move.awaiting[0] === swiped.settled
        ? { ...move, awaiting: move.awaiting.slice(1) }
        : move,
    )
    .filter(kept);

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

/**
 * The results the Sessions as synced show that their Moves wait for next.
 * A Session no longer synced owes nothing more.
 */
export const seenOf = (
  sessions: ReadonlyArray<OnMachine<Session>>,
  moving: ReadonlyArray<Move>,
): ReadonlyArray<Swiped> =>
  moving.flatMap((move) => {
    const session = sessions.find(
      ({ machineId, id }) =>
        machineId === move.machineId && id === move.sessionId,
    );
    const next = move.awaiting[0];
    if (next === undefined) return [];
    const shown = session === undefined ? next : session.settledAt !== null;
    const { machineId, sessionId } = move;
    return shown === next ? [{ machineId, sessionId, settled: next }] : [];
  });

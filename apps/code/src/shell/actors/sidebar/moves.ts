import type { Session } from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';

/*
 * Sessions swiped to Settle or un-Settle them, as the sidebar draws them:
 * where the last swipe put them, before their Machine has said so. Each
 * Session's Move is its own, with its own window and its own call.
 *
 * 1. Swipe   the row moves at once, and nothing is asked of its Machine
 *            while the Undo window, WINDOW, is open.
 * 2. Undo    inside it, the swipe is taken back: nothing is asked at all,
 *            so nothing synced can move the row.
 * 3. Commit  the window closed, or the page hidden or the sidebar gone,
 *            the last swipe is asked of its Machine: one call at a time,
 *            and a swipe made meanwhile after it, if it still differs.
 * 4. Drop    nothing waiting nor asked, and the Session as synced where
 *            the last swipe put it: the Move is done.
 */

/** How long a swipe can be undone before it is asked of its Machine, in ms. */
export const WINDOW = 5000;

/** A Session swiped: where it goes, and what its Machine has been asked. */
export interface Move {
  /** Its last swipe's place in the order swiped. */
  readonly n: number;
  readonly machineId: string;
  readonly sessionId: string;
  /** Where its last swipe puts it. */
  readonly settled: boolean;
  /** Where its Machine has it, as far as this sidebar knows. */
  readonly base: boolean;
  /** What its Machine is being asked now, if anything. */
  readonly asking: boolean | null;
  /** When the last swipe is to be asked, while it waits to be. */
  readonly due: number | null;
}

/** A Session, and where a swipe or its Machine puts it. */
interface Swiped {
  readonly machineId: string;
  readonly sessionId: string;
  readonly settled: boolean;
}

type Key = Omit<Swiped, 'settled'>;

const isOf =
  ({ machineId, sessionId }: Key) =>
  (move: Move) =>
    move.machineId === machineId && move.sessionId === sessionId;

const update = (
  moving: ReadonlyArray<Move>,
  key: Key,
  change: (move: Move) => Move | null,
) =>
  moving.flatMap((move) => {
    if (!isOf(key)(move)) return [move];
    const next = change(move);
    return next === null ? [] : [next];
  });

// What its Machine will have once what it is asked lands.
const landing = (move: Move) => move.asking ?? move.base;

/** 1. Swipe, or 2. its Undo: the swipe numbered `n`, made at `now`. */
export const swipedOf = (
  moving: ReadonlyArray<Move>,
  { machineId, sessionId, settled }: Swiped,
  n: number,
  now: number,
): ReadonlyArray<Move> => {
  const was = moving.find(isOf({ machineId, sessionId }));
  const move: Move = {
    n,
    machineId,
    sessionId,
    settled,
    base: was?.base ?? !settled,
    asking: was?.asking ?? null,
    due: null,
  };
  return [
    ...moving.filter((each) => each !== was),
    { ...move, due: settled === landing(move) ? null : now + WINDOW },
  ];
};

/** 3. The Moves whose last swipe is due now and not being asked yet. */
export const dueOf = (moving: ReadonlyArray<Move>, now: number) =>
  moving.filter(
    ({ due, asking }) => due !== null && due <= now && asking === null,
  );

/** 3. Every swipe waiting is due at once, as the page is hidden. */
export const flushedOf = (moving: ReadonlyArray<Move>) =>
  moving.map((move) => (move.due === null ? move : { ...move, due: 0 }));

/** 3. Its Machine is being asked to put it where the last swipe did. */
export const askingOf = (moving: ReadonlyArray<Move>, asked: Swiped) =>
  update(moving, asked, (move) => ({
    ...move,
    asking: asked.settled,
    due: null,
  }));

/** 3. Its Machine took what it was asked; a later swipe the same way waits for nothing. */
export const answeredOf = (moving: ReadonlyArray<Move>, answered: Swiped) =>
  update(moving, answered, (move) => ({
    ...move,
    base: answered.settled,
    asking: null,
    due: move.settled === answered.settled ? null : move.due,
  }));

/** Its Machine refused: the Move is dropped, and the row goes back. */
export const refusedOf = (moving: ReadonlyArray<Move>, key: Key) =>
  update(moving, key, () => null);

/** 4. The Moves with nothing waiting nor asked, whose Session as synced agrees. */
export const doneOf = (
  sessions: ReadonlyArray<OnMachine<Session>>,
  moving: ReadonlyArray<Move>,
): ReadonlyArray<Key> =>
  moving.flatMap((move) => {
    if (move.due !== null || move.asking !== null) return [];
    const session = sessions.find(
      ({ machineId, id }) =>
        machineId === move.machineId && id === move.sessionId,
    );
    const agrees =
      session === undefined || (session.settledAt !== null) === move.settled;
    const { machineId, sessionId } = move;
    return agrees ? [{ machineId, sessionId }] : [];
  });

/** 4. Drops a Move, if it still has nothing waiting nor asked. */
export const droppedOf = (moving: ReadonlyArray<Move>, key: Key) =>
  update(moving, key, (move) =>
    move.due === null && move.asking === null ? null : move,
  );

/** Whether anything is waiting to be asked, or being asked. */
export const busy = (moving: ReadonlyArray<Move>) =>
  moving.some(({ due, asking }) => due !== null || asking !== null);

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
        const move = moving.find(
          isOf({ machineId: session.machineId, sessionId: session.id }),
        );
        if (move === undefined || move.settled === (session.settledAt !== null))
          return session;
        return {
          ...session,
          settledAt: move.settled ? PENDING + move.n : null,
        };
      });

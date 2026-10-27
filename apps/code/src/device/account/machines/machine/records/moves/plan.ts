/*
 * One Session's Move, as plain data: where the user last put it, whether
 * that is still to be asked of its Machine, and what it is being asked
 * now. Every rule of when to ask is here; `moves.ts` only runs them.
 * Settle and un-Settle can be asked again harmlessly, so the last put is
 * always asked, never skipped for one its Machine may have taken: a call
 * whose answer was lost may or may not have landed.
 */

export interface Plan {
  /** Its last put's place in the order put, newest highest. */
  readonly n: number;
  /** Where the user last put it: Settled or not. */
  readonly settled: boolean;
  /** The last put is still to be asked. */
  readonly waiting: boolean;
  /** What its Machine is being asked now, if anything. */
  readonly asking: boolean | null;
  /** The Session as synced agrees with where it was put. */
  readonly agreed: boolean;
}

/** The user put it at `settled`, `n`th: to be asked once nothing is in flight. */
export const put = (
  was: Plan | undefined,
  settled: boolean,
  n: number,
): Plan => ({
  n,
  settled,
  waiting: true,
  asking: was?.asking ?? null,
  agreed: false,
});

/** What to do now: wait for the call in flight, ask the last put, or nothing. */
export const next = (plan: Plan): 'asking' | 'ask' | 'idle' =>
  plan.asking !== null ? 'asking' : plan.waiting ? 'ask' : 'idle';

/** Its Machine is being asked to put it where the user last did. */
export const asking = (plan: Plan): Plan => ({
  ...plan,
  waiting: false,
  asking: plan.settled,
});

/**
 * What its Machine said to the call in flight: took it, or refused it. A
 * refusal of the last put drops the Move, `null`, and the row goes back;
 * with a later put waiting, it changes nothing, and that one is asked.
 */
export const answered = (plan: Plan, took: boolean): Plan | null =>
  took || plan.waiting ? { ...plan, asking: null } : null;

/** Nothing in flight, and nothing left to ask. */
export const idle = (plan: Plan) => next(plan) === 'idle';

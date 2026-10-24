/*
 * One Session's Move, as plain data: where the user last put it, what its
 * Machine was last asked and took, and what it is being asked now. Every
 * rule of when to ask is here; `moves.ts` only runs them.
 */

export interface Plan {
  /** Its last put's place in the order put, newest highest. */
  readonly n: number;
  /** Where the user last put it: Settled or not. */
  readonly settled: boolean;
  /** What its Machine last took; null before any call landed. */
  readonly sent: boolean | null;
  /** What its Machine is being asked now, if anything. */
  readonly asking: boolean | null;
  /** The Session as synced agrees with where it was put. */
  readonly agreed: boolean;
}

/** The user put it at `settled`, `n`th. */
export const put = (
  was: Plan | undefined,
  settled: boolean,
  n: number,
): Plan => ({
  n,
  settled,
  sent: was?.sent ?? null,
  asking: was?.asking ?? null,
  agreed: false,
});

/**
 * What to do now: wait for the call in flight, ask its Machine for where
 * it was put, or nothing, as its Machine already took that.
 */
export const next = (plan: Plan): 'asking' | 'ask' | 'idle' =>
  plan.asking !== null ? 'asking' : plan.settled === plan.sent ? 'idle' : 'ask';

/** Its Machine is being asked to put it where the user did. */
export const asking = (plan: Plan): Plan => ({
  ...plan,
  asking: plan.settled,
});

/**
 * What its Machine said to `asked`: took it, or refused it. A refusal of
 * the last put drops the Move, `null`, and the row goes back; one of an
 * earlier put changes nothing, and the last is still asked.
 */
export const answered = (
  plan: Plan,
  asked: boolean,
  took: boolean,
): Plan | null =>
  took
    ? { ...plan, sent: asked, asking: null }
    : plan.settled === asked
      ? null
      : { ...plan, asking: null };

/** Nothing in flight, and nothing left to ask. */
export const idle = (plan: Plan) => next(plan) === 'idle';

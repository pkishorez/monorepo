/*
 * One Session's Move, as plain data: where the user last put it, where its
 * Machine has it, what its Machine is being asked, and when the last ask is
 * due. Every rule of when to ask is here; `moves.ts` only runs them.
 */

/** How long a swipe can be undone before it is asked of its Machine, in ms. */
export const WINDOW = 5000;

export interface Plan {
  /** Its last ask's place in the order asked, newest highest. */
  readonly n: number;
  /** Where the user last put it: Settled or not. */
  readonly settled: boolean;
  /** Where its Machine has it, as far as this app knows. */
  readonly base: boolean;
  /** What its Machine is being asked now, if anything. */
  readonly asking: boolean | null;
  /** When the last ask goes to its Machine, while it waits to; 0 at once. */
  readonly due: number | null;
}

// What its Machine will have once what it is asked lands.
const landing = (plan: Plan) => plan.asking ?? plan.base;

/**
 * The user put it at `settled`, `n`th, at `now`: after `wait` ms, or at once
 * for 0. Where its Machine will have it anyway, nothing is due: an Undo
 * inside a swipe's window asks nothing.
 */
export const put = (
  was: Plan | undefined,
  settled: boolean,
  n: number,
  now: number,
  wait: number,
): Plan => {
  const plan: Plan = {
    n,
    settled,
    base: was?.base ?? !settled,
    asking: was?.asking ?? null,
    due: null,
  };
  return settled === landing(plan) ? plan : { ...plan, due: now + wait };
};

/** What to do now: nothing, wait `ms`, or ask its Machine. */
export const next = (
  plan: Plan,
  now: number,
): 'idle' | 'asking' | 'ask' | { readonly ms: number } => {
  if (plan.asking !== null) return 'asking';
  if (plan.due === null) return 'idle';
  return plan.due <= now ? 'ask' : { ms: plan.due - now };
};

/** Its Machine is being asked to put it where the user did. */
export const asking = (plan: Plan): Plan => ({
  ...plan,
  asking: plan.settled,
  due: null,
});

/** Its Machine put it at `settled`; a later ask the same way is not due. */
export const answered = (plan: Plan, settled: boolean): Plan => ({
  ...plan,
  base: settled,
  asking: null,
  due: plan.settled === settled ? null : plan.due,
});

/** Every ask waiting is due at once, as the page goes. */
export const hurried = (plan: Plan): Plan =>
  plan.due === null ? plan : { ...plan, due: 0 };

/** Nothing waits nor is asked: only the Session as synced is left to agree. */
export const idle = (plan: Plan) => plan.due === null && plan.asking === null;

/** What Device State keeps of it: where it goes, while its Machine has yet to confirm. */
export const kept = (plan: Plan | undefined) =>
  plan === undefined || idle(plan) ? null : plan.settled;

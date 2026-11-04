import type { Usage } from '@kestack/connect/code';

/*
 * What a session's turns took, as its agent reported it and nothing more:
 * each turn's time, its tokens and, where the agent tells it, its cost;
 * and the session's, summed. Nothing is estimated: what the agent does not
 * report is not there, so a Codex session has no cost and a fork's first
 * turn none of its own.
 */

/** A turn as the transcript tells it. */
export interface Told {
  readonly id: string;
  /** What you asked, or what started it when you did not. */
  readonly prompt: string;
  /** How it ended; null while it runs. */
  readonly status: Status | null;
  /** How long it ran, in ms, when its start is known. */
  readonly duration: number | null;
  readonly usage: Usage | null;
  /** What it cost by itself, and the session so far, in USD; null when not told. */
  readonly spend: {
    readonly turn: number | null;
    readonly total: number | null;
  } | null;
}

export type Status = 'done' | 'cancelled' | 'interrupted' | 'failed';

/** Tokens by what they were: read from the cache, written to it, sent fresh, and the model's output. */
export interface Tokens {
  readonly read: number;
  readonly written: number;
  readonly fresh: number;
  readonly output: number;
}

export interface TurnFacts {
  readonly id: string;
  /** Its place in the session, from 1. */
  readonly n: number;
  readonly prompt: string;
  readonly status: Status | null;
  readonly duration: number | null;
  readonly tokens: Tokens | null;
  /** What it cost by itself; null when not told. */
  readonly cost: number | null;
}

export interface Facts {
  readonly turns: ReadonlyArray<TurnFacts>;
  /** The session's cost so far, as last told; null when never told. */
  readonly cost: number | null;
  /** Every turn's time that is known, summed, in ms. */
  readonly duration: number;
  readonly tokens: Tokens;
}

const NONE: Tokens = { read: 0, written: 0, fresh: 0, output: 0 };

const tokensOf = (usage: Usage): Tokens => ({
  read: usage.cacheReadTokens ?? 0,
  written: usage.cacheWriteTokens ?? 0,
  fresh: usage.inputTokens,
  output: usage.outputTokens,
});

const add = (a: Tokens, b: Tokens): Tokens => ({
  read: a.read + b.read,
  written: a.written + b.written,
  fresh: a.fresh + b.fresh,
  output: a.output + b.output,
});

/** All of a turn's tokens. */
export const totalOf = (tokens: Tokens) =>
  tokens.read + tokens.written + tokens.fresh + tokens.output;

/** What went in: read from the cache, written to it, and sent fresh. */
export const inputOf = (tokens: Tokens) =>
  tokens.read + tokens.written + tokens.fresh;

export const factsOf = (told: ReadonlyArray<Told>): Facts => {
  let cost: number | null = null;
  let duration = 0;
  let tokens = NONE;
  const turns = told.map((each, at): TurnFacts => {
    const own = each.usage === null ? null : tokensOf(each.usage);
    if (own !== null) tokens = add(tokens, own);
    if (each.duration !== null) duration += each.duration;
    if (each.spend?.total != null) cost = each.spend.total;
    return {
      id: each.id,
      n: at + 1,
      prompt: each.prompt,
      status: each.status,
      duration: each.duration,
      tokens: own,
      cost: each.spend?.turn ?? null,
    };
  });
  return { turns, cost, duration, tokens };
};

/** The finished turn that most stands out by `by`, of two or more; null when none does. */
export const mostOf = (
  facts: Facts,
  by: (turn: TurnFacts) => number | null,
): TurnFacts | null => {
  const scored = facts.turns.flatMap((turn) => {
    const score = by(turn);
    return score === null || score <= 0 ? [] : [{ turn, score }];
  });
  if (scored.length < 2) return null;
  return scored.reduce((a, b) => (b.score > a.score ? b : a)).turn;
};

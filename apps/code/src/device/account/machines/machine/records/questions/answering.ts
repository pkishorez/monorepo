import { Schema } from 'effect';
import type { SessionQuestions } from '@kestack/connect/code';
import { Answering } from '../../../machines.ts';

/*
 * How a Session's Agent Questions are being answered on this device: each
 * Item's answer so far, which questions are minimised, which were sent
 * with an Item left, and which were sent. Its Machine keeps it while each
 * question is asked, so leaving the session, or the page, loses nothing;
 * a question that leaves the Machine's feed, answered, declined or its
 * Turn ended, takes its part with it. Kept in memory only, never on this
 * device's storage: an answer may be a secret. Its shape is shared, in
 * `machines.ts`, for the Question Panel to give it.
 */

export const sameAnswering = Schema.toEquivalence(Answering);

/** Nothing answered yet. */
export const fresh: Answering = {
  drafts: {},
  minimised: [],
  tried: [],
  sent: [],
};

/** Only the questions in `listed` are kept. */
export const stillAsked = (
  answering: Answering,
  listed: ReadonlySet<string>,
): Answering => {
  const kept = (id: string) => listed.has(id);
  return {
    drafts: Object.fromEntries(
      Object.entries(answering.drafts).filter(([id]) => kept(id)),
    ),
    minimised: answering.minimised.filter(kept),
    tried: answering.tried.filter(kept),
    sent: answering.sent.filter(kept),
  };
};

/** Whether nothing of it is kept. */
const empty = (answering: Answering) =>
  Object.keys(answering.drafts).length === 0 &&
  answering.minimised.length === 0 &&
  answering.tried.length === 0 &&
  answering.sent.length === 0;

/**
 * Each Session's answering, by Session id, as the Machine's feed lists
 * them: a question no longer asked goes, and a Session with nothing left.
 */
export const answeringAsked = (
  bySession: Readonly<Record<string, Answering>>,
  questions: ReadonlyArray<SessionQuestions>,
): Readonly<Record<string, Answering>> =>
  Object.fromEntries(
    Object.entries(bySession).flatMap(([sessionId, answering]) => {
      const asked = questions.find((each) => each.sessionId === sessionId);
      const left = stillAsked(
        answering,
        new Set(asked?.questions.map(({ id }) => id) ?? []),
      );
      return empty(left) ? [] : [[sessionId, left]];
    }),
  );

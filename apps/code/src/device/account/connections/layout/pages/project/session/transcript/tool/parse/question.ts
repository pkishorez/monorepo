import type { Part } from '@kestack/connect/code';

/*
 * An Agent Question's call, as the transcript reads it: each question,
 * Claude's (`AskUserQuestion`) or Codex's (`request_user_input`), and,
 * once the user has answered, what they chose and typed, by Item id, as
 * the harness recorded it; declined when it recorded no answers. An Item's
 * id is Codex's own, or Claude's place in the list.
 */

type Call = Extract<Part, { readonly type: 'toolCall' }>;
type Answered = Extract<Part, { readonly type: 'questionAnswered' }>;

/** One question as asked, and what was answered. */
export type Asked = {
  readonly header: string;
  readonly question: string;
  /** Typed as a secret: its answer is never shown. */
  readonly secret: boolean;
  /** What was chosen and typed; null when not answered. */
  readonly answer: ReadonlyArray<string> | null;
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown, key: string): string | undefined => {
  const found = record(value)?.[key];
  return typeof found === 'string' && found.trim() !== '' ? found : undefined;
};

/**
 * An Agent Question's call read for the transcript, with what was
 * answered once it is; null when its input holds no question.
 */
export const askedOf = (
  call: Call,
  answered: Answered | null,
): {
  readonly asked: ReadonlyArray<Asked>;
  readonly declined: boolean;
} | null => {
  const questions = record(call.input)?.['questions'];
  if (call.tool !== 'question' || !Array.isArray(questions)) return null;
  const answers = answered?.answers ?? null;
  const asked = questions.flatMap((each: unknown, index): Asked[] => {
    const question = text(each, 'question');
    if (question === undefined) return [];
    const chosen = answers?.[text(each, 'id') ?? String(index)] ?? [];
    return [
      {
        header: text(each, 'header') ?? '',
        question,
        secret: record(each)?.['isSecret'] === true,
        answer: chosen.length === 0 ? null : chosen,
      },
    ];
  });
  if (asked.length === 0) return null;
  return { asked, declined: answered !== null && answered.answers === null };
};

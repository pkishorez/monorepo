import type { Part } from '@kestack/connect/code';

/*
 * An Agent Question's call, as the transcript reads it: each question,
 * Claude's (`AskUserQuestion`) or Codex's (`request_user_input`), and,
 * once its result is in, what was answered, read from what the harness
 * told the agent: Claude's `"question"="answer"` pairs, Codex's
 * `header: answer, answer` lines, or JSON; and whether it was declined,
 * as Claude's error or Codex's "Not answered" says.
 */

type Call = Extract<Part, { readonly type: 'toolCall' }>;

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

const words = (value: unknown): ReadonlyArray<string> | null => {
  if (typeof value === 'string') return value === '' ? null : [value];
  if (Array.isArray(value)) {
    const all = value.filter(
      (each): each is string => typeof each === 'string',
    );
    return all.length === 0 ? null : all;
  }
  // Codex's `{ answers: [...] }` for each question.
  const inner = record(value);
  return inner === null ? null : words(inner['answers']);
};

/** What Claude Code tells the agent: `"question"="answer"` for each one answered. */
const claudeAnswers = (output: string) => {
  const pairs = new Map<string, string>();
  for (const [, question = '', answer = ''] of output.matchAll(
    /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g,
  ))
    pairs.set(question.replace(/\\"/g, '"'), answer.replace(/\\"/g, '"'));
  return pairs;
};

/** What Codex's result says: `header: answer, answer` on a line for each one answered. */
const codexAnswers = (output: string) => {
  const lines = new Map<string, string>();
  for (const line of output.split('\n')) {
    const at = line.indexOf(': ');
    if (at > 0) lines.set(line.slice(0, at), line.slice(at + 2));
  }
  return lines;
};

/** The answers a result gives, by question id, question or header. */
const answersIn = (call: Call, output: string) => {
  const given = record(record(call.input)?.['answers']);
  let parsed: Readonly<Record<string, unknown>> | null = null;
  try {
    parsed = record(record(JSON.parse(output))?.['answers']);
  } catch {
    parsed = null;
  }
  const said = claudeAnswers(output);
  const lines = codexAnswers(output);
  return (
    id: string,
    question: string,
    header: string,
  ): ReadonlyArray<string> | null =>
    words(parsed?.[id]) ??
    words(parsed?.[question]) ??
    words(given?.[question]) ??
    said.get(question)?.split(', ') ??
    (header !== '' ? (lines.get(header)?.split(', ') ?? null) : null);
};

/**
 * An Agent Question's call read for the transcript, with what was
 * answered once its result is in; null when its input holds no question.
 */
export const askedOf = (
  call: Call,
  result: { readonly output: string; readonly isError: boolean } | null,
): {
  readonly asked: ReadonlyArray<Asked>;
  readonly declined: boolean;
} | null => {
  const questions = record(call.input)?.['questions'];
  if (call.tool !== 'question' || !Array.isArray(questions)) return null;
  const answers = answersIn(call, result?.output ?? '');
  const asked = questions.flatMap((each: unknown, index): Asked[] => {
    const question = text(each, 'question');
    if (question === undefined) return [];
    const header = text(each, 'header') ?? '';
    return [
      {
        header,
        question,
        secret: record(each)?.['isSecret'] === true,
        answer:
          result === null
            ? null
            : answers(text(each, 'id') ?? String(index), question, header),
      },
    ];
  });
  if (asked.length === 0) return null;
  const declined =
    result !== null &&
    (result.isError || /\bdeclined\b/i.test(result.output)) &&
    asked.every(({ answer }) => answer === null);
  return { asked, declined };
};

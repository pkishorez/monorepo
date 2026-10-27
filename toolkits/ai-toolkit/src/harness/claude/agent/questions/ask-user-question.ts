import type {
  AgentQuestion,
  QuestionAnswer,
  QuestionItem,
} from '../../../../contract/wire/index.js';

/** The tool Claude Code asks an Agent Question with. */
export const ASK_USER_QUESTION = 'AskUserQuestion';

/** What Claude Code hears when the user declines, so it carries on. */
export const DECLINED =
  'The user declined to answer. Carry on without their answer, and do not assume what they would have chosen.';

const isObj = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** One question of the tool's input, as far as it can be read. */
const toItem = (question: unknown, index: number): QuestionItem | undefined => {
  if (!isObj(question) || typeof question['question'] !== 'string')
    return undefined;
  const options = Array.isArray(question['options'])
    ? question['options'].filter(isObj).map((option) => ({
        label: text(option['label']),
        description: text(option['description']),
      }))
    : [];
  return {
    // Its place in the list: the answer goes back by its question's text.
    id: String(index),
    header: text(question['header']),
    question: question['question'],
    options,
    multiSelect: question['multiSelect'] === true,
    // Claude Code always lets the user type an answer of their own.
    other: true,
    secret: false,
  };
};

/**
 * The Agent Question an `AskUserQuestion` call asks, by its tool call id;
 * undefined when its input holds no question it can read.
 */
export const toQuestion = (
  toolUseId: string,
  input: Readonly<Record<string, unknown>>,
  now: number,
): AgentQuestion | undefined => {
  const questions = Array.isArray(input['questions']) ? input['questions'] : [];
  const items = questions.flatMap((question, index) => {
    const item = toItem(question, index);
    return item === undefined ? [] : [item];
  });
  const [first, ...rest] = items;
  return first === undefined
    ? undefined
    : { id: toolUseId, items: [first, ...rest], askedAt: now };
};

/**
 * The tool's input with the user's answers added, as Claude Code reads
 * them: by question text, the choices joined with commas. An Item answered
 * with nothing is left out.
 */
export const answered = (
  question: AgentQuestion,
  input: Readonly<Record<string, unknown>>,
  answer: QuestionAnswer,
): Record<string, unknown> => {
  const answers: Record<string, string> = {};
  for (const item of question.items) {
    const chosen = (answer[item.id] ?? []).filter((each) => each !== '');
    if (chosen.length > 0) answers[item.question] = chosen.join(', ');
  }
  return { ...input, answers };
};

import {
  claude,
  codex,
  common,
  type CommonProtocol,
} from '../../runtime/protocol/index.js';
import type { Message } from '../../runtime/table/index.js';

type AiCustomPart = CommonProtocol['AiCustomPart'];
type AiMessagePart = CommonProtocol['AiMessagePart'];
const CODEX_PARTS = codex.parts;
const CLAUDE_PARTS = claude.parts;
const COMMON_PARTS = common.parts;

/** One rendered turn: consecutive Message rows of one Run and role, folded. */
export interface AiUiMessage {
  readonly id: string;
  readonly runId: string;
  readonly role: 'system' | 'user' | 'assistant';
  readonly parts: ReadonlyArray<AiMessagePart>;
  readonly createdAt: Date;
  readonly metadata: unknown | null;
}

type QuestionPart = Extract<
  AiCustomPart,
  { readonly name: typeof COMMON_PARTS.QUESTION }
>;
type QuestionResolutionPart =
  | Extract<
      AiCustomPart,
      { readonly name: typeof CLAUDE_PARTS.PERMISSION_RESOLVED }
    >
  | Extract<
      AiCustomPart,
      { readonly name: typeof CODEX_PARTS.REQUEST_RESOLVED }
    >;

export interface AiUiQuestionInteraction {
  readonly type: 'question-interaction';
  readonly requestId: string;
  readonly questions: QuestionPart['data']['questions'];
  readonly answers?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly resolved: boolean;
}

export interface AiUiActivity {
  readonly type: 'activity';
  readonly items: ReadonlyArray<AiMessagePart>;
}

export type AiUiConversationPart =
  | AiMessagePart
  | AiUiQuestionInteraction
  | AiUiActivity;

export interface AiUiConversationMessage extends Omit<AiUiMessage, 'parts'> {
  readonly parts: ReadonlyArray<AiUiConversationPart>;
}

const isPlainStream = (
  part: AiMessagePart,
): part is Extract<AiMessagePart, { type: 'text' | 'thinking' }> =>
  (part.type === 'text' && part.metadata === undefined) ||
  (part.type === 'thinking' &&
    part.stepId === undefined &&
    part.signature === undefined);

const appendParts = (
  into: AiMessagePart[],
  parts: ReadonlyArray<AiMessagePart>,
): void => {
  for (const part of parts) {
    const last = into.at(-1);
    if (
      last !== undefined &&
      isPlainStream(last) &&
      isPlainStream(part) &&
      last.type === part.type
    ) {
      into[into.length - 1] = { ...last, content: last.content + part.content };
    } else {
      into.push(part);
    }
  }
};

/**
 * Folds immutable Message rows into turns. Rows must already be ordered by
 * creation time. Streamed text and thinking split across rows join back into
 * one part.
 */
export const toUiMessages = (
  rows: ReadonlyArray<Message>,
): ReadonlyArray<AiUiMessage> => {
  const turns: Array<AiUiMessage & { parts: AiMessagePart[] }> = [];
  for (const row of rows) {
    const last = turns.at(-1);
    if (
      last !== undefined &&
      last.runId === row.runId &&
      last.role === row.role
    ) {
      appendParts(last.parts, row.data.parts);
      continue;
    }
    const parts: AiMessagePart[] = [];
    appendParts(parts, row.data.parts);
    turns.push({
      id: row.id,
      runId: row.runId,
      role: row.role,
      parts,
      createdAt: new Date(row.createdAt),
      metadata: row.data.metadata,
    });
  }
  return turns;
};

interface PositionedPart {
  readonly key: string;
  readonly order: number;
  readonly part: AiMessagePart;
}

const isQuestion = (part: AiMessagePart): part is QuestionPart =>
  part.type === 'custom' && part.name === COMMON_PARTS.QUESTION;

const isQuestionResolution = (
  part: AiMessagePart,
): part is QuestionResolutionPart =>
  part.type === 'custom' &&
  (part.name === CLAUDE_PARTS.PERMISSION_RESOLVED ||
    part.name === CODEX_PARTS.REQUEST_RESOLVED);

const resolvedAnswers = (
  resolution: QuestionResolutionPart | undefined,
): Readonly<Record<string, ReadonlyArray<string>>> | undefined => {
  if (resolution?.name === CLAUDE_PARTS.PERMISSION_RESOLVED) {
    return resolution.data.answer.behavior === 'answer'
      ? resolution.data.answer.answers
      : undefined;
  }
  return resolution?.data.answer.type === 'question'
    ? resolution.data.answer.answers
    : undefined;
};

const withGroupedActivity = (
  message: AiUiConversationMessage,
): AiUiConversationMessage => {
  const parts: AiUiConversationPart[] = [];
  let activity: AiMessagePart[] = [];
  const flush = () => {
    if (activity.length === 0) return;
    parts.push({ type: 'activity', items: activity });
    activity = [];
  };
  for (const part of message.parts) {
    if (
      part.type === 'text' ||
      part.type === 'thinking' ||
      part.type === 'question-interaction' ||
      part.type === 'activity' ||
      (part.type === 'custom' && part.name === COMMON_PARTS.ERROR)
    ) {
      flush();
      parts.push(part);
    } else {
      activity.push(part);
    }
  }
  flush();
  return { ...message, parts };
};

const activityOnly = (
  message: AiUiConversationMessage,
): message is AiUiConversationMessage & {
  readonly parts: readonly [AiUiActivity];
} => message.parts.length === 1 && message.parts[0]?.type === 'activity';

/**
 * Folds rows into turns, pairs each question with its Resolution and tool
 * activity, and groups everything that is not prose into activity blocks.
 */
export const toUiConversation = (
  rows: ReadonlyArray<Message>,
): ReadonlyArray<AiUiConversationMessage> => {
  const messages = toUiMessages(rows);
  let order = 0;
  const positioned: PositionedPart[] = messages.flatMap((message) =>
    message.parts.map((part, partIndex) => ({
      key: `${message.id}:${partIndex}`,
      order: order++,
      part,
    })),
  );
  const consumed = new Set<string>();
  const replacements = new Map<string, AiUiQuestionInteraction>();

  for (const item of positioned) {
    if (!isQuestion(item.part)) continue;
    const question = item.part;
    const resolution = positioned.find(
      ({ part }) =>
        isQuestionResolution(part) &&
        part.data.requestId === question.data.requestId,
    );
    const toolParts =
      question.data.toolCallId === undefined
        ? []
        : positioned.filter(
            ({ part }) =>
              (part.type === 'tool-call' &&
                part.id === question.data.toolCallId) ||
              (part.type === 'tool-result' &&
                part.toolCallId === question.data.toolCallId),
          );
    const related = [item, ...toolParts];
    if (resolution !== undefined) related.push(resolution);
    for (const part of related) consumed.add(part.key);
    const anchor = related.reduce((first, part) =>
      part.order < first.order ? part : first,
    );
    const resolvedPart =
      resolution !== undefined && isQuestionResolution(resolution.part)
        ? resolution.part
        : undefined;
    const answers = resolvedAnswers(resolvedPart);
    replacements.set(anchor.key, {
      type: 'question-interaction',
      requestId: question.data.requestId,
      questions: question.data.questions,
      ...(answers === undefined ? {} : { answers }),
      resolved: resolvedPart !== undefined,
    });
  }

  const projected = messages.flatMap((message) => {
    const parts = message.parts.flatMap<AiUiConversationPart>(
      (part, partIndex) => {
        const key = `${message.id}:${partIndex}`;
        const replacement = replacements.get(key);
        if (replacement !== undefined) return [replacement];
        return consumed.has(key) ? [] : [part];
      },
    );
    return parts.length === 0 ? [] : [{ ...message, parts }];
  });

  const grouped: AiUiConversationMessage[] = [];
  for (const message of projected.map(withGroupedActivity)) {
    const previous = grouped.at(-1);
    if (
      previous !== undefined &&
      previous.runId === message.runId &&
      activityOnly(previous) &&
      activityOnly(message)
    ) {
      grouped[grouped.length - 1] = {
        ...previous,
        parts: [
          {
            type: 'activity',
            items: [...previous.parts[0].items, ...message.parts[0].items],
          },
        ],
      };
    } else {
      grouped.push(message);
    }
  }
  return grouped;
};

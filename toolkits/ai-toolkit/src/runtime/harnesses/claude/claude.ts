import {
  query,
  type Options,
  type PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import { Effect, Option, Schema } from 'effect';
import { INTERACTION_TIMEOUT_MS } from '../../constants.js';
import type { Mailbox } from '../../interaction-mailbox/index.js';
import {
  COMMON_PARTS,
  customPart,
  type AgentQuestion,
  type ClaudeAnswer,
  type ClaudeRunInput,
  type HarnessContext,
  type RunOutcome,
} from '../../protocol/index.js';
import { ClaudeTranslator } from './translate.js';

const ClaudeQuestionInputSchema = Schema.Struct({
  questions: Schema.Array(
    Schema.Struct({
      question: Schema.String,
      options: Schema.optional(
        Schema.Array(Schema.Struct({ label: Schema.String })),
      ),
    }),
  ),
});

const decodeClaudeQuestions = Schema.decodeUnknownOption(
  ClaudeQuestionInputSchema,
);
const decodeUpdatedInput = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Unknown),
);

const claudeQuestions = (
  input: Record<string, unknown>,
): ReadonlyArray<AgentQuestion> => {
  const decoded = decodeClaudeQuestions(input);
  if (Option.isNone(decoded)) return [];
  return decoded.value.questions.map((question, index) => ({
    id: String(index),
    prompt: question.question,
    ...(question.options === undefined
      ? {}
      : { choices: question.options.map((option) => option.label) }),
  }));
};

export const toClaudePermissionResult = (
  toolName: string,
  toolInput: Record<string, unknown>,
  answer: ClaudeAnswer,
): PermissionResult => {
  if (answer.behavior === 'answer') {
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'deny', message: 'Unexpected question answer' };
    }
    const decoded = decodeClaudeQuestions(toolInput);
    if (Option.isNone(decoded)) {
      return { behavior: 'deny', message: 'Invalid question input' };
    }
    const answers: Record<string, string> = {};
    for (const [index, question] of decoded.value.questions.entries()) {
      const selections = answer.answers[String(index)];
      if (
        selections === undefined ||
        selections.length === 0 ||
        selections.some((selection) => selection.length === 0)
      ) {
        return { behavior: 'deny', message: 'Every question needs an answer' };
      }
      answers[question.question] = selections.join(', ');
    }
    return {
      behavior: 'allow',
      updatedInput: { ...toolInput, answers },
    };
  }
  if (answer.behavior === 'allow') {
    const updatedInput =
      answer.updatedInput === undefined
        ? Option.none()
        : decodeUpdatedInput(answer.updatedInput);
    if (answer.updatedInput !== undefined && Option.isNone(updatedInput)) {
      return {
        behavior: 'deny',
        message: 'Updated input must be an object',
      };
    }
    return {
      behavior: 'allow',
      ...(Option.isNone(updatedInput)
        ? {}
        : { updatedInput: updatedInput.value }),
    };
  }
  return {
    behavior: 'deny',
    message: answer.message ?? 'Denied',
  };
};

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Runs one Claude Code turn, writing everything it produces to the Transcript. */
export const claudeRun = async (
  input: ClaudeRunInput,
  context: HarnessContext,
  mailbox: Mailbox<ClaudeAnswer>,
): Promise<RunOutcome> => {
  const translator = new ClaudeTranslator(context.transcript);
  const controller = new AbortController();
  const abort = () => controller.abort(context.signal.reason);
  context.signal.addEventListener('abort', abort, { once: true });

  const sdkOptions: Options = {
    abortController: controller,
    cwd: context.cwd,
    model: input.model,
    includePartialMessages: true,
    ...(input.options.maxTurns === undefined
      ? {}
      : { maxTurns: input.options.maxTurns }),
    ...(context.sessionId === undefined ? {} : { resume: context.sessionId }),
    ...(input.options.permissionMode === undefined
      ? {}
      : { permissionMode: input.options.permissionMode }),
    ...(input.options.thinking === undefined
      ? {}
      : { maxThinkingTokens: input.options.thinking.budgetTokens }),
    ...(input.options.allowDangerouslySkipPermissions === undefined
      ? {}
      : {
          allowDangerouslySkipPermissions:
            input.options.allowDangerouslySkipPermissions,
        }),
    canUseTool: async (toolName, toolInput, details) => {
      const requestId = crypto.randomUUID();
      const question = toolName === 'AskUserQuestion';
      const answer = await Effect.runPromise(
        mailbox.ask(requestId, {
          kind: question ? 'question' : 'permission',
          emit: () =>
            context.transcript.part(
              question
                ? customPart(COMMON_PARTS.QUESTION, {
                    requestId,
                    toolCallId: details.toolUseID,
                    questions: claudeQuestions(toolInput),
                  })
                : customPart(COMMON_PARTS.PERMISSION_REQUEST, {
                    requestId,
                    toolCallId: details.toolUseID,
                    toolName,
                    input: toolInput,
                    ...(details.title === undefined
                      ? {}
                      : { title: details.title }),
                  }),
            ),
          timeoutMs:
            input.options.permissionTimeoutMs ?? INTERACTION_TIMEOUT_MS,
          timeoutAnswer: {
            behavior: 'deny',
            message: 'Permission request timed out',
          },
          cancelAnswer: { behavior: 'deny', message: 'Run cancelled' },
          onResolved: (resolved) =>
            context.transcript.resolution(
              customPart(COMMON_PARTS.PERMISSION_RESOLVED, {
                requestId,
                toolCallId: details.toolUseID,
                answer: resolved,
              }),
            ),
        }),
      );
      return toClaudePermissionResult(toolName, toolInput, answer);
    },
  };

  let outcome: RunOutcome | undefined;
  try {
    for await (const event of query({
      prompt: input.message.content,
      options: sdkOptions,
    })) {
      const signal = translator.apply(event);
      if (signal === undefined) continue;
      if (signal.type === 'session') await context.session(signal.sessionId);
      else outcome = signal;
    }
    return outcome ?? { type: 'completed' };
  } catch (cause) {
    return { type: 'failed', message: errorMessage(cause) };
  } finally {
    context.signal.removeEventListener('abort', abort);
  }
};

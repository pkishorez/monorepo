import {
  query,
  type Options,
  type PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import {
  chat,
  type AdapterYieldChunk,
  type DefaultMessageMetadataByModality,
  type TextOptions,
} from '@tanstack/ai';
import { BaseTextAdapter } from '@tanstack/ai/adapters';
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters';
import { Effect, Option, Schema } from 'effect';
import {
  COMMON_EVENTS,
  customEvent,
  type AgentChunk,
  type ClaudeAnswer,
  type HarnessContext,
  type Mailbox,
  type UserTurn,
} from '../run-state/index.js';
import { translateClaudeMessage } from './translate.js';

export interface ClaudeRunInput {
  readonly threadId: string;
  readonly runId: string;
  readonly message: UserTurn;
  readonly model: string;
  readonly options: {
    readonly thinking?: { readonly budgetTokens: number } | undefined;
    readonly permissionMode?: string | undefined;
    readonly allowDangerouslySkipPermissions?: boolean | undefined;
    readonly maxTurns?: number | undefined;
    readonly permissionTimeoutMs?: number | undefined;
  };
}

type ClaudeModelOptions = ClaudeRunInput['options'];

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
): ReadonlyArray<{
  readonly id: string;
  readonly prompt: string;
  readonly choices?: ReadonlyArray<string>;
}> => {
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

class ClaudeAdapter extends BaseTextAdapter<
  string,
  ClaudeModelOptions,
  readonly ['text'],
  DefaultMessageMetadataByModality
> {
  readonly name = 'claude-code';

  constructor(
    model: string,
    private readonly input: ClaudeRunInput,
    private readonly context: HarnessContext,
    private readonly mailbox: Mailbox<ClaudeAnswer>,
  ) {
    super({}, model);
  }

  async *chatStream(
    _options: TextOptions<ClaudeModelOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    yield {
      type: 'RUN_STARTED',
      runId: this.input.runId,
      threadId: this.input.threadId,
      model: this.input.model,
      timestamp: Date.now(),
    } as AdapterYieldChunk;
    const controller = new AbortController();
    const abort = () => controller.abort(this.context.signal.reason);
    this.context.signal.addEventListener('abort', abort, { once: true });

    const sdkOptions: Options = {
      abortController: controller,
      cwd: this.context.cwd,
      model: this.input.model,
      ...(this.input.options.maxTurns === undefined
        ? {}
        : { maxTurns: this.input.options.maxTurns }),
      ...(this.context.sessionId === undefined
        ? {}
        : { resume: this.context.sessionId }),
      ...(this.input.options.permissionMode === undefined
        ? {}
        : {
            permissionMode: this.input.options.permissionMode as Exclude<
              Options['permissionMode'],
              undefined
            >,
          }),
      ...(this.input.options.thinking === undefined
        ? {}
        : { maxThinkingTokens: this.input.options.thinking.budgetTokens }),
      ...(this.input.options.allowDangerouslySkipPermissions === undefined
        ? {}
        : {
            allowDangerouslySkipPermissions:
              this.input.options.allowDangerouslySkipPermissions,
          }),
      canUseTool: async (toolName, toolInput, details) => {
        const requestId = crypto.randomUUID();
        const question = toolName === 'AskUserQuestion';
        const answer = await Effect.runPromise(
          this.mailbox.ask(requestId, {
            kind: question ? 'question' : 'permission',
            emit: this.context.emit(
              question
                ? customEvent(COMMON_EVENTS.QUESTION, {
                    requestId,
                    questions: claudeQuestions(toolInput),
                  })
                : customEvent(COMMON_EVENTS.PERMISSION_REQUEST, {
                    requestId,
                    toolName,
                    input: toolInput,
                    ...(details.title === undefined
                      ? {}
                      : { title: details.title }),
                  }),
            ),
            timeoutMs: this.input.options.permissionTimeoutMs ?? 300_000,
            timeoutAnswer: {
              behavior: 'deny',
              message: 'Permission request timed out',
            },
            cancelAnswer: {
              behavior: 'deny',
              message: 'Run cancelled',
            },
            onResolved: (resolved) =>
              this.context.emit(
                customEvent(COMMON_EVENTS.PERMISSION_RESOLVED, {
                  requestId,
                  answer: resolved,
                }),
              ),
          }),
        );
        if (answer.behavior === 'allow') {
          const updatedInput =
            answer.updatedInput === undefined
              ? Option.none()
              : decodeUpdatedInput(answer.updatedInput);
          if (
            answer.updatedInput !== undefined &&
            Option.isNone(updatedInput)
          ) {
            return {
              behavior: 'deny',
              message: 'Updated input must be an object',
            } satisfies PermissionResult;
          }
          return {
            behavior: 'allow',
            ...(Option.isNone(updatedInput)
              ? {}
              : { updatedInput: updatedInput.value }),
          } satisfies PermissionResult;
        }
        return {
          behavior: 'deny',
          message: answer.message ?? 'Denied',
        } satisfies PermissionResult;
      },
    };

    try {
      for await (const event of query({
        prompt: this.input.message.content,
        options: sdkOptions,
      })) {
        for (const chunk of translateClaudeMessage(event, this.input)) {
          yield chunk;
        }
      }
    } finally {
      this.context.signal.removeEventListener('abort', abort);
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<ClaudeModelOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(new Error('Structured output is not supported'));
  }
}

export const claudeRun = (
  input: ClaudeRunInput,
  context: HarnessContext,
  mailbox: Mailbox<ClaudeAnswer>,
): AsyncIterable<AgentChunk> => {
  const stream = chat({
    adapter: new ClaudeAdapter(input.model, input, context, mailbox),
    messages: [
      {
        id: input.message.id,
        role: 'user',
        content: input.message.content,
      },
    ],
    modelOptions: input.options,
    threadId: input.threadId,
    runId: input.runId,
  });
  // Adapter boundary: TanStack's KnownCustomEvent is closed, while this package
  // replaces CUSTOM with its own typed union.
  return stream as AsyncIterable<AgentChunk>;
};

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  chat,
  type AdapterYieldChunk,
  type DefaultMessageMetadataByModality,
  type TextOptions,
} from '@tanstack/ai';
import {
  BaseTextAdapter,
  type StructuredOutputOptions,
  type StructuredOutputResult,
} from '@tanstack/ai/adapters';
import { Effect, Option, Schema } from 'effect';
import {
  CODEX_EVENTS,
  COMMON_EVENTS,
  customEvent,
  type AgentChunk,
  type CodexAnswer,
  type HarnessContext,
  type Mailbox,
  type UserTurn,
} from '../run-state/index.js';
import { translateCodexEvent } from './translate.js';

export interface CodexRunInput {
  readonly threadId: string;
  readonly runId: string;
  readonly message: UserTurn;
  readonly model: string;
  readonly options: {
    readonly reasoningEffort?:
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high'
      | 'xhigh'
      | undefined;
    readonly approvalPolicy?: 'untrusted' | 'on-request' | 'never' | undefined;
    readonly sandbox?:
      | 'read-only'
      | 'workspace-write'
      | 'danger-full-access'
      | undefined;
    readonly requestTimeoutMs?: number | undefined;
  };
}

const JsonRpcEnvelopeSchema = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.optional(
      Schema.Union([Schema.Number, Schema.String, Schema.Null]),
    ),
    method: Schema.optional(Schema.String),
    params: Schema.optional(Schema.JsonObject),
    result: Schema.optional(Schema.Unknown),
    error: Schema.optional(Schema.Unknown),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

const ThreadResponseSchema = Schema.Struct({
  thread: Schema.Struct({ id: Schema.String }),
});

const CodexQuestionsSchema = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    question: Schema.String,
    options: Schema.optional(
      Schema.Array(Schema.Struct({ label: Schema.String })),
    ),
  }),
);

const decodeEnvelope = Schema.decodeUnknownSync(JsonRpcEnvelopeSchema);
const decodeThreadResponse = Schema.decodeUnknownSync(ThreadResponseSchema);
const decodeQuestions = Schema.decodeUnknownOption(CodexQuestionsSchema);

class AsyncQueue<A> {
  readonly #values: A[] = [];
  readonly #waiters: Array<(value: IteratorResult<A>) => void> = [];
  #done = false;

  offer(value: A): void {
    if (this.#done) return;
    const waiter = this.#waiters.shift();
    if (waiter === undefined) this.#values.push(value);
    else waiter({ done: false, value });
  }

  end(): void {
    this.#done = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  async take(): Promise<IteratorResult<A>> {
    const value = this.#values.shift();
    if (value !== undefined) return { done: false, value };
    if (this.#done) return { done: true, value: undefined };
    return new Promise((resolve) => this.#waiters.push(resolve));
  }
}

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

class CodexSession {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #output = new AsyncQueue<AdapterYieldChunk>();
  readonly #pending = new Map<number, PendingCall>();
  #nextId = 1;
  #sessionSeen = false;
  #terminal = false;

  constructor(
    private readonly input: CodexRunInput,
    private readonly context: HarnessContext,
    private readonly mailbox: Mailbox<CodexAnswer>,
    command: string,
  ) {
    this.#process = spawn(command, ['app-server', '--stdio'], {
      cwd: context.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#process.stderr.resume();
    this.#process.once('error', (error) => this.#fail(error));
    context.signal.addEventListener('abort', () => this.close(), {
      once: true,
    });
    void this.#read();
  }

  async start(): Promise<void> {
    await this.#request('initialize', {
      clientInfo: { name: 'ai-toolkit', title: 'AI Toolkit', version: '0.0.1' },
      capabilities: null,
    });
    this.#write({ method: 'initialized', params: {} });

    const threadResponse =
      this.context.sessionId === undefined
        ? await this.#request('thread/start', {
            model: this.input.model,
            cwd: this.context.cwd,
            approvalPolicy: this.input.options.approvalPolicy ?? 'on-request',
            sandbox: this.input.options.sandbox ?? 'workspace-write',
            ephemeral: false,
          })
        : await this.#request('thread/resume', {
            threadId: this.context.sessionId,
            model: this.input.model,
            cwd: this.context.cwd,
            approvalPolicy: this.input.options.approvalPolicy ?? 'on-request',
            sandbox: this.input.options.sandbox ?? 'workspace-write',
          });

    const { thread } = decodeThreadResponse(threadResponse);
    if (!this.#sessionSeen) {
      this.#sessionSeen = true;
      this.#output.offer(
        customEvent(COMMON_EVENTS.SESSION_ID, { sessionId: thread.id }),
      );
    }

    await this.#request('turn/start', {
      threadId: thread.id,
      clientUserMessageId: this.input.message.id,
      input: [
        { type: 'text', text: this.input.message.content, text_elements: [] },
      ],
      model: this.input.model,
      effort: this.input.options.reasoningEffort ?? null,
    });
  }

  async *chunks(): AsyncIterable<AdapterYieldChunk> {
    while (true) {
      const next = await this.#output.take();
      if (next.done) return;
      yield next.value;
    }
  }

  close(): void {
    this.#process.kill();
    this.#output.end();
  }

  #write(value: unknown): void {
    this.#process.stdin.write(`${JSON.stringify(value)}\n`);
  }

  #request(method: string, params: unknown): Promise<unknown> {
    const id = this.#nextId++;
    this.#write({ id, method, params });
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
  }

  async #read(): Promise<void> {
    const lines = createInterface({ input: this.#process.stdout });
    try {
      for await (const line of lines) {
        const envelope = decodeEnvelope(JSON.parse(line) as unknown);
        if (typeof envelope.id === 'number' && envelope.method === undefined) {
          const pending = this.#pending.get(envelope.id);
          if (pending === undefined) continue;
          this.#pending.delete(envelope.id);
          if (envelope.error === undefined) pending.resolve(envelope.result);
          else pending.reject(new Error(JSON.stringify(envelope.error)));
          continue;
        }
        if (envelope.id !== undefined && typeof envelope.method === 'string') {
          await this.#handleServerRequest(envelope);
          continue;
        }
        for (const chunk of translateCodexEvent(envelope, this.input)) {
          if (
            chunk.type === 'CUSTOM' &&
            chunk.name === COMMON_EVENTS.SESSION_ID
          ) {
            if (this.#sessionSeen) continue;
            this.#sessionSeen = true;
          }
          this.#output.offer(chunk);
          if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
            this.#terminal = true;
            this.#output.end();
          }
        }
      }
      if (!this.#terminal && !this.context.signal.aborted) {
        this.#fail(
          new Error('Codex app-server exited before the turn completed'),
        );
      }
    } catch (cause) {
      this.#fail(cause);
    }
  }

  #fail(cause: unknown): void {
    if (this.#terminal) return;
    this.#terminal = true;
    const error = cause instanceof Error ? cause : new Error(String(cause));
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#output.offer({
      type: 'RUN_ERROR',
      runId: this.input.runId,
      threadId: this.input.threadId,
      message: error.message,
      timestamp: Date.now(),
    } as AdapterYieldChunk);
    this.#output.end();
  }

  async #handleServerRequest(
    envelope: typeof JsonRpcEnvelopeSchema.Type,
  ): Promise<void> {
    const requestId = String(envelope.id);
    const method = String(envelope.method);
    const params = envelope.params ?? {};
    const isQuestion = method === 'item/tool/requestUserInput';
    const isPermissions = method === 'item/permissions/requestApproval';
    const isElicitation = method === 'mcpServer/elicitation/request';
    const isApproval =
      method === 'item/commandExecution/requestApproval' ||
      method === 'item/fileChange/requestApproval' ||
      method === 'applyPatchApproval' ||
      method === 'execCommandApproval';
    if (!isQuestion && !isPermissions && !isElicitation && !isApproval) {
      this.#write({
        id: envelope.id,
        error: {
          code: -32_601,
          message: `Unsupported server request: ${method}`,
        },
      });
      return;
    }
    const questions = this.#questions(params.questions);
    const negativeAnswer: CodexAnswer = isQuestion
      ? {
          type: 'question',
          answers: Object.fromEntries(
            questions.map((question) => [question.id, []]),
          ),
        }
      : isPermissions
        ? { type: 'permissions', permissions: {}, scope: 'turn' }
        : isElicitation
          ? {
              type: 'elicitation',
              action: 'decline',
              content: null,
              metadata: null,
            }
          : {
              type: 'approval',
              decision: 'decline',
              reason: 'Request timed out',
            };
    const cancelAnswer: CodexAnswer = isElicitation
      ? {
          type: 'elicitation',
          action: 'cancel',
          content: null,
          metadata: null,
        }
      : isApproval
        ? { type: 'approval', decision: 'cancel' }
        : negativeAnswer;
    const answer = await Effect.runPromise(
      this.mailbox.ask(requestId, {
        kind: isQuestion ? 'question' : 'permission',
        emit: this.context.emit(
          isQuestion
            ? customEvent(COMMON_EVENTS.QUESTION, {
                requestId,
                questions,
              })
            : customEvent(COMMON_EVENTS.PERMISSION_REQUEST, {
                requestId,
                toolName: method,
                input: params,
              }),
        ),
        timeoutMs: this.input.options.requestTimeoutMs ?? 300_000,
        timeoutAnswer: negativeAnswer,
        cancelAnswer,
        onResolved: (resolved) =>
          this.context.emit(
            customEvent(CODEX_EVENTS.REQUEST_RESOLVED, {
              requestId,
              answer: resolved,
            }),
          ),
      }),
    );

    const expectedType = isQuestion
      ? 'question'
      : isPermissions
        ? 'permissions'
        : isElicitation
          ? 'elicitation'
          : 'approval';
    if (answer.type !== expectedType) {
      throw new Error(
        `Codex request ${requestId} expects ${expectedType}, received ${answer.type}`,
      );
    }
    const result =
      answer.type === 'question'
        ? {
            answers: Object.fromEntries(
              Object.entries(answer.answers).map(([id, answers]) => [
                id,
                { answers },
              ]),
            ),
          }
        : answer.type === 'permissions'
          ? {
              permissions: answer.permissions,
              scope: answer.scope,
              ...(answer.strictAutoReview === undefined
                ? {}
                : { strictAutoReview: answer.strictAutoReview }),
            }
          : answer.type === 'elicitation'
            ? {
                action: answer.action,
                content: answer.content,
                _meta: answer.metadata,
              }
            : { decision: answer.decision };
    this.#write({ id: envelope.id, result });
  }

  #questions(value: unknown): ReadonlyArray<{
    readonly id: string;
    readonly prompt: string;
    readonly choices?: ReadonlyArray<string>;
  }> {
    const decoded = decodeQuestions(value);
    if (Option.isNone(decoded)) return [];
    return decoded.value.map((question) => ({
      id: question.id,
      prompt: question.question,
      ...(question.options === undefined
        ? {}
        : { choices: question.options.map((option) => option.label) }),
    }));
  }
}

type CodexModelOptions = CodexRunInput['options'];

class CodexAdapter extends BaseTextAdapter<
  string,
  CodexModelOptions,
  readonly ['text'],
  DefaultMessageMetadataByModality
> {
  readonly name = 'codex';

  constructor(
    model: string,
    private readonly input: CodexRunInput,
    private readonly context: HarnessContext,
    private readonly mailbox: Mailbox<CodexAnswer>,
    private readonly command: string,
  ) {
    super({}, model);
  }

  async *chatStream(
    _options: TextOptions<CodexModelOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    yield {
      type: 'RUN_STARTED',
      runId: this.input.runId,
      threadId: this.input.threadId,
      model: this.input.model,
      timestamp: Date.now(),
    } as AdapterYieldChunk;
    const session = new CodexSession(
      this.input,
      this.context,
      this.mailbox,
      this.command,
    );
    try {
      await session.start();
      yield* session.chunks();
    } finally {
      session.close();
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<CodexModelOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(new Error('Structured output is not supported'));
  }
}

export const codexRun = (
  input: CodexRunInput,
  context: HarnessContext,
  mailbox: Mailbox<CodexAnswer>,
  command = 'codex',
): AsyncIterable<AgentChunk> => {
  const stream = chat({
    adapter: new CodexAdapter(input.model, input, context, mailbox, command),
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

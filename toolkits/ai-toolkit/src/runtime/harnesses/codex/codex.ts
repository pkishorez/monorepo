import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Effect, Option, Schema } from 'effect';
import { CODEX_COMMAND, INTERACTION_TIMEOUT_MS } from '../../constants.js';
import type { Mailbox } from '../../interaction-mailbox/index.js';
import {
  CODEX_PARTS,
  COMMON_PARTS,
  customPart,
  type AgentQuestion,
  type CodexAnswer,
  type CodexRunInput,
  type HarnessContext,
  type RunOutcome,
} from '../../protocol/index.js';
import { applyCodexEvent } from './translate.js';

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

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

class CodexSession {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, PendingCall>();
  readonly #finished: Promise<RunOutcome>;
  #finish!: (outcome: RunOutcome) => void;
  #nextId = 1;
  #sessionReported = false;
  #terminal = false;

  constructor(
    private readonly input: CodexRunInput,
    private readonly context: HarnessContext,
    private readonly mailbox: Mailbox<CodexAnswer>,
    command: string,
  ) {
    this.#finished = new Promise((resolve) => {
      this.#finish = resolve;
    });
    this.#process = spawn(
      command,
      ['app-server', '--stdio', '--enable', 'default_mode_request_user_input'],
      { cwd: context.cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );
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
      capabilities: { experimentalApi: true },
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
    await this.#session(thread.id);

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

  finished(): Promise<RunOutcome> {
    return this.#finished;
  }

  close(): void {
    this.#process.kill();
    this.#end({ type: 'failed', message: 'Run cancelled' });
  }

  async #session(sessionId: string): Promise<void> {
    if (this.#sessionReported) return;
    this.#sessionReported = true;
    await this.context.session(sessionId);
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

  #end(outcome: RunOutcome): void {
    if (this.#terminal) return;
    this.#terminal = true;
    this.#finish(outcome);
  }

  async #read(): Promise<void> {
    const lines = createInterface({ input: this.#process.stdout });
    try {
      for await (const line of lines) {
        const parsed: unknown = JSON.parse(line);
        const envelope = decodeEnvelope(parsed);
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
        const signal = applyCodexEvent(envelope, this.context.transcript);
        if (signal === undefined) continue;
        if (signal.type === 'session') {
          await this.#session(signal.sessionId);
        } else {
          this.#end(signal);
          this.#process.kill();
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
    const error = cause instanceof Error ? cause : new Error(String(cause));
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#end({ type: 'failed', message: error.message });
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
        emit: () =>
          this.context.transcript.part(
            isQuestion
              ? customPart(COMMON_PARTS.QUESTION, { requestId, questions })
              : customPart(COMMON_PARTS.PERMISSION_REQUEST, {
                  requestId,
                  toolName: method,
                  input: params,
                }),
          ),
        timeoutMs:
          this.input.options.requestTimeoutMs ?? INTERACTION_TIMEOUT_MS,
        timeoutAnswer: negativeAnswer,
        cancelAnswer,
        onResolved: (resolved) =>
          this.context.transcript.resolution(
            customPart(CODEX_PARTS.REQUEST_RESOLVED, {
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

  #questions(value: unknown): ReadonlyArray<AgentQuestion> {
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

/** Runs one Codex turn through the app-server, writing to the Transcript. */
export const codexRun = async (
  input: CodexRunInput,
  context: HarnessContext,
  mailbox: Mailbox<CodexAnswer>,
  command: string = CODEX_COMMAND,
): Promise<RunOutcome> => {
  const session = new CodexSession(input, context, mailbox, command);
  try {
    await session.start();
    return await session.finished();
  } catch (cause) {
    return { type: 'failed', message: errorMessage(cause) };
  } finally {
    session.close();
  }
};

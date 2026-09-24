import { Context, Effect, Layer, Scope } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import {
  CODEX_MODELS,
  CLAUDE_MODELS,
  type ClaudeAnswer,
  type ClaudeStartInput,
  type CodexAnswer,
  type CodexStartInput,
} from 'kai-toolkit/rpc';
import type { Thread } from 'kai-toolkit/table';
import {
  AiPlaygroundServerRpc,
  makePlaygroundSync,
  type AiPlaygroundApi,
  type PlaygroundSync,
} from 'kai-toolkit/playground';
import {
  layerWebSocketProtocol,
  RpcConnection,
} from 'rpc-toolkit/rpc/websocket-client';

const SERVER_URL = 'wss://kai-toolkit.kishore.computer/rpc';

type ClaudeModel = (typeof CLAUDE_MODELS)[number];
type CodexModel = (typeof CODEX_MODELS)[number];

const claudeInput = (
  threadId: string,
  runId: string,
  content: string,
  model: ClaudeModel,
): ClaudeStartInput => {
  const common = {
    threadId,
    runId,
    message: { id: crypto.randomUUID(), content },
    options: {},
  };
  switch (model) {
    case 'claude-opus-4-6':
      return { ...common, model };
    case 'claude-sonnet-4-6':
      return { ...common, model };
    case 'claude-haiku-4-5':
      return { ...common, model };
  }
};

const codexInput = (
  threadId: string,
  runId: string,
  content: string,
  model: CodexModel,
): CodexStartInput => ({
  threadId,
  runId,
  message: { id: crypto.randomUUID(), content },
  model,
  options: {},
});

export interface AiPlaygroundClient {
  readonly threads: PlaygroundSync['threads'];
  readonly messages: PlaygroundSync['messages'];
  readonly createThread: (harness: 'claude' | 'codex') => Promise<string>;
  readonly sendClaude: (
    threadId: string,
    content: string,
    model: ClaudeModel,
  ) => Promise<void>;
  readonly sendCodex: (
    threadId: string,
    content: string,
    model: CodexModel,
  ) => Promise<void>;
  readonly respondClaude: (
    runId: string,
    requestId: string,
    answer: ClaudeAnswer,
  ) => Promise<void>;
  readonly respondCodex: (
    runId: string,
    requestId: string,
    answer: CodexAnswer,
  ) => Promise<void>;
  readonly cancelThread: (thread: Thread) => Promise<void>;
}

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);

const makeClient = (
  api: AiPlaygroundApi,
  sync: PlaygroundSync,
): AiPlaygroundClient => ({
  threads: sync.threads,
  messages: sync.messages,
  createThread: async (harness) => {
    const id = crypto.randomUUID();
    await run(api.createThread({ id, harness }));
    return id;
  },
  sendClaude: (threadId, content, model) => {
    const runId = crypto.randomUUID();
    return run(api.claudeStart(claudeInput(threadId, runId, content, model)));
  },
  sendCodex: (threadId, content, model) => {
    const runId = crypto.randomUUID();
    return run(api.codexStart(codexInput(threadId, runId, content, model)));
  },
  respondClaude: (runId, requestId, answer) =>
    run(api.claudeRespond({ runId, requestId, answer })),
  respondCodex: (runId, requestId, answer) =>
    run(api.codexRespond({ runId, requestId, answer })),
  cancelThread: async (thread) => {
    if (thread.activeRunId !== null)
      await run(api.cancelRun({ runId: thread.activeRunId }));
  },
});

const boot = Effect.gen(function* () {
  const context = yield* Layer.build(
    layerWebSocketProtocol({
      url: SERVER_URL,
      serialization: RpcSerialization.layerJson,
    }),
  );
  const connection = Context.get(context, RpcConnection);
  const protocol = Layer.succeed(
    RpcClient.Protocol,
    Context.get(context, RpcClient.Protocol),
  );
  const api = yield* RpcClient.make(AiPlaygroundServerRpc).pipe(
    Effect.provide(protocol),
  );
  const sync = makePlaygroundSync({
    api,
    keepSubscribed: connection.keepSubscribed,
    name: 'kai-toolkit-playground',
  });
  return makeClient(api, sync);
});

let booted: Promise<AiPlaygroundClient> | undefined;

export const aiPlayground = (): Promise<AiPlaygroundClient> =>
  (booted ??= run(
    boot.pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe())),
  ));

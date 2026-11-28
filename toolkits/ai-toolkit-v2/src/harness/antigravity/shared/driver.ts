import {
  client,
  type ClientApp,
  type ClientConnection,
  methods,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk/unstable';
import { Context, Effect, type Scope } from 'effect';
import {
  AntigravityError,
  type Flags,
  type PromptInput,
  type Result,
} from '../contract/index.ts';

export class Driver extends Context.Service<
  Driver,
  {
    readonly connect: (
      app: ClientApp,
      cwd: string | undefined,
      flags: Flags | undefined,
    ) => Effect.Effect<ClientConnection, AntigravityError, Scope.Scope>;
    readonly print: (
      input: PromptInput,
    ) => Effect.Effect<Result, AntigravityError>;
  }
>()('@kestack/ai-toolkit-v2/Antigravity/Driver') {}

export const call = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({
    try: f,
    catch: (cause) =>
      new AntigravityError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

export const connect = (
  cwd: string | undefined,
  flags: Flags | undefined,
  app = client({ name: '@kestack/ai-toolkit-v2' }),
) =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const connection = yield* driver.connect(app, cwd, flags);
    const initialize = yield* call(() =>
      connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          elicitation: { form: {} },
        },
        clientInfo: { name: '@kestack/ai-toolkit-v2', version: '0.0.0' },
      }),
    );
    return { connection, initialize };
  });

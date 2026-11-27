import * as acp from '@agentclientprotocol/sdk/unstable';
import { Duration, Effect, Layer } from 'effect';
import { AntigravityError } from '../contract/index.ts';
import { Driver } from '../shared/index.ts';
import type { Agent, Recording } from './recordings/index.ts';

export interface Options {
  readonly agent: Agent;
  readonly recordings: Readonly<Record<string, Recording>>;
  readonly pick?: (prompt: ReadonlyArray<acp.ContentBlock>) => string;
  readonly pace?: Duration.Input;
}

const sleep = (millis: number) =>
  new Promise((resolve) => setTimeout(resolve, millis));

const named = (prompt: ReadonlyArray<acp.ContentBlock>) => {
  const first = prompt[0];
  return first?.type === 'text' ? first.text : '';
};

const makeAgent = (options: Options, exit: () => void) => {
  const pace = Duration.toMillis(Duration.fromInputUnsafe(options.pace ?? 0));
  const names = Object.keys(options.recordings);
  const pick = (prompt: ReadonlyArray<acp.ContentBlock>) => {
    const name = (options.pick ?? named)(prompt);
    return (
      options.recordings[name] ??
      options.recordings[names[0] ?? ''] ?? {
        steps: [],
        response: { stopReason: 'end_turn' },
      }
    );
  };
  const running = new Map<string, (reason: acp.StopReason) => void>();
  let configOptions = options.agent.session.configOptions ?? [];

  const opened = (sessionId: string, client: acp.AgentContext) => {
    setTimeout(() => {
      void client
        .notify(acp.methods.client.session.update, {
          sessionId,
          update: {
            sessionUpdate: 'available_commands_update',
            availableCommands: options.agent.commands,
          },
        })
        .catch(() => undefined);
    }, pace);
    return { ...options.agent.session, configOptions };
  };

  const prompt = async (
    { sessionId, prompt }: acp.PromptRequest,
    client: acp.AgentContext,
  ): Promise<acp.PromptResponse> => {
    running.get(sessionId)?.('end_turn');
    const recording = pick(prompt);
    let stop: acp.StopReason | undefined;
    const stopped = Promise.withResolvers<acp.StopReason>();
    const mine = (reason: acp.StopReason) => {
      stop ??= reason;
      stopped.resolve(reason);
    };
    running.set(sessionId, mine);
    const replay = async (): Promise<acp.PromptResponse> => {
      for (const step of recording.steps) {
        await sleep(pace);
        if (stop) return { stopReason: stop };
        if ('exit' in step) {
          exit();
          return new Promise(() => {});
        }
        if ('update' in step) {
          await client.notify(acp.methods.client.session.update, {
            sessionId,
            update: step.update,
          });
        } else if ('permission' in step) {
          await client.request(acp.methods.client.session.requestPermission, {
            ...step.permission,
            sessionId,
          });
        } else {
          await client.request(acp.methods.client.elicitation.create, {
            ...step.elicitation,
            sessionId,
          });
        }
      }
      return recording.response;
    };
    const response = await Promise.race([
      replay(),
      stopped.promise.then((stopReason) => ({ stopReason })),
    ]);
    stop ??= response.stopReason;
    if (running.get(sessionId) === mine) running.delete(sessionId);
    setTimeout(async () => {
      for (const update of recording.after ?? []) {
        await sleep(pace);
        await client
          .notify(acp.methods.client.session.update, { sessionId, update })
          .catch(() => undefined);
      }
    }, pace);
    return response;
  };

  return acp
    .agent({ name: 'fake agy' })
    .onRequest(acp.methods.agent.initialize, () => options.agent.initialize)
    .onRequest(acp.methods.agent.session.new, ({ client }) => {
      const sessionId = crypto.randomUUID();
      return { sessionId, ...opened(sessionId, client) };
    })
    .onRequest(acp.methods.agent.session.resume, ({ params, client }) =>
      opened(params.sessionId, client),
    )
    .onRequest(acp.methods.agent.session.list, () => options.agent.sessions)
    .onRequest(acp.methods.agent.session.close, () => ({}))
    .onRequest(acp.methods.agent.session.setConfigOption, ({ params }) => {
      configOptions = configOptions.map((option) =>
        option.id === params.configId && typeof params.value === 'string'
          ? { ...option, currentValue: params.value }
          : option,
      ) as typeof configOptions;
      return { configOptions };
    })
    .onNotification(acp.methods.agent.session.cancel, ({ params }) => {
      running.get(params.sessionId)?.('cancelled');
    })
    .onRequest(acp.methods.agent.session.prompt, ({ params, client }) =>
      prompt(params, client),
    );
};

export const layer = (options: Options) =>
  Layer.succeed(
    Driver,
    Driver.of({
      connect: (app) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const held: { connection?: acp.ClientConnection } = {};
            held.connection = app.connect(
              makeAgent(options, () =>
                held.connection?.close(
                  new AntigravityError({ message: 'agy exited' }),
                ),
              ),
            );
            return held.connection;
          }),
          (connection) => Effect.sync(() => connection.close()),
        ),
      print: (input) =>
        Effect.succeed({
          ...options.agent.print,
          conversation_id: crypto.randomUUID(),
          ...(input.jsonSchema === undefined
            ? {}
            : { json_schema: input.jsonSchema }),
        }),
    }),
  );

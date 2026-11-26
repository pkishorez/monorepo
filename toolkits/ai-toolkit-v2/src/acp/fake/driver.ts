import * as acp from '@agentclientprotocol/sdk/unstable';
import { Effect, Layer } from 'effect';
import type { Array } from 'effect';
import { AcpError } from '../contract/index.ts';
import { AcpDriver } from '../shared/index.ts';
import type { Recording, Step } from './recordings/index.ts';

const pick = (
  recordings: Array.NonEmptyReadonlyArray<Recording>,
  prompt: ReadonlyArray<acp.ContentBlock>,
) => {
  const text = prompt.find((block) => block.type === 'text');
  return (
    recordings.find((recording) => recording.name === text?.text) ??
    recordings[0]
  );
};

const play = async (
  client: acp.AgentContext,
  sessionId: acp.SessionId,
  step: Exclude<Step, { readonly exit: true }>,
) => {
  if ('update' in step) {
    await client.notify(acp.methods.client.session.update, {
      sessionId,
      update: step.update,
    });
  } else if ('request' in step) {
    await client.request(acp.methods.client.session.requestPermission, {
      ...step.request,
      sessionId,
    });
  } else {
    await client.request(
      acp.methods.client.elicitation.create,
      'sessionId' in step.elicitation
        ? { ...step.elicitation, sessionId }
        : step.elicitation,
    );
  }
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeAgent = (
  recordings: Array.NonEmptyReadonlyArray<Recording>,
  exit: () => void,
) => {
  const first = recordings[0];
  const cancelled = new Set<acp.SessionId>();
  const fresh = () => ({ ...first.session, sessionId: crypto.randomUUID() });
  return acp
    .agent({ name: 'fake' })
    .onRequest(acp.methods.agent.initialize, () => first.initialize)
    .onRequest(acp.methods.agent.session.new, fresh)
    .onRequest(acp.methods.agent.session.fork, fresh)
    .onRequest(acp.methods.agent.session.load, () => first.session)
    .onRequest(acp.methods.agent.session.resume, () => first.session)
    .onRequest(
      acp.methods.agent.session.list,
      () => first.sessions ?? { sessions: [] },
    )
    .onRequest(acp.methods.agent.session.setMode, () => ({}))
    .onRequest(acp.methods.agent.session.setConfigOption, () => ({
      configOptions: first.session.configOptions ?? [],
    }))
    .onNotification(acp.methods.agent.session.cancel, ({ params }) => {
      cancelled.add(params.sessionId);
    })
    .onRequest(
      acp.methods.agent.session.prompt,
      async ({ params, client }): Promise<acp.PromptResponse> => {
        const { sessionId } = params;
        cancelled.delete(sessionId);
        const recording = pick(recordings, params.prompt);
        for (const step of recording.steps) {
          await tick();
          if (cancelled.has(sessionId)) break;
          if ('exit' in step) {
            exit();
            return new Promise(() => {});
          }
          await play(client, sessionId, step);
        }
        return cancelled.has(sessionId)
          ? { stopReason: 'cancelled' }
          : recording.response;
      },
    );
};

export const layer = (recordings: Array.NonEmptyReadonlyArray<Recording>) =>
  Layer.succeed(
    AcpDriver,
    AcpDriver.of({
      connect: (app) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const held: { connection?: acp.ClientConnection } = {};
            const agent = makeAgent(recordings, () =>
              held.connection?.close(
                new AcpError({ message: 'fake agent exited' }),
              ),
            );
            const connection = app.connect(agent);
            held.connection = connection;
            return connection;
          }),
          (connection) => Effect.sync(() => connection.close()),
        ),
    }),
  );

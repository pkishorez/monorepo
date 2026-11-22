import { Cause, Effect, Stream } from 'effect';
import {
  CodeClient,
  CodeClients,
} from '../../connection/plugins/code/api/index.js';
import type { AnotherDevice } from '../computers/index.js';
import type { Act } from './computer.js';

/*
 * What another device of the signed-in User does to a computer, carried
 * out against Connect in the tab as that device would: through Connect
 * Cloud's client, or the computer's code Plugin over its own socket, the
 * public contract any App calls. Never another Fake. Each act comes to one
 * line a person reads: what it did, or why it could not.
 */

/** How long an act waits for an answer, the computer's socket or Connect Cloud's. */
const ANSWER = '30 seconds';

/** The first answer each part of a question offers; one with none is answered in words. */
const firstChoices = (
  items: ReadonlyArray<{
    readonly id: string;
    readonly options: ReadonlyArray<{ readonly label: string }>;
  }>,
) =>
  Object.fromEntries(
    items.map(({ id, options }) => [
      id,
      [options[0]?.label ?? 'Answered on another device'],
    ]),
  );

/** Carries out `act` on computer `id` from `device`, and says what it came to. */
export const actElsewhere = (
  device: AnotherDevice,
  id: string,
  act: Act,
): Effect.Effect<string> => {
  const on = <A, E>(effect: Effect.Effect<A, E, CodeClient>) =>
    CodeClients.on(id, effect).pipe(
      Effect.provideService(CodeClients, device.code),
    );
  const done: Effect.Effect<string, unknown> = Effect.gen(function* () {
    switch (act._tag) {
      case 'Rename': {
        const name = act.displayName.trim();
        yield* device.cloud.Rename({ id, displayName: name || null });
        return name ? `Renamed it ${name}` : 'Took its Display Name away';
      }
      case 'Forget':
        yield* device.cloud.Forget({ id });
        return 'Forgot it';
      case 'StartSession':
        return yield* on(
          Effect.gen(function* () {
            const api = yield* CodeClient;
            const project = yield* api.addProject({ path: act.project });
            const harness = (yield* api.harnesses()).find(
              ({ available }) => available,
            );
            if (harness === undefined) return 'No agent can run there';
            const steps = yield* Stream.runCollect(
              api.startSession({
                id: null,
                projectId: project.id,
                account: harness.account,
                model: harness.defaultModel,
                settings: {},
                text: act.text,
                attachments: [],
                branch: null,
                newWorktree: false,
              }),
            );
            const last = steps.at(-1);
            return last?._tag === 'Started'
              ? `Started Session ${last.session.id}`
              : 'The Session did not start';
          }),
        );
      case 'SettleSession':
        yield* on(
          Effect.flatMap(CodeClient, (api) =>
            api.settleSession({ sessionId: act.session }),
          ),
        );
        return `Settled Session ${act.session}`;
      case 'AnswerQuestion':
        return yield* on(
          Effect.gen(function* () {
            const api = yield* CodeClient;
            const asked = yield* Stream.runHead(api.agentQuestions());
            const question = (asked._tag === 'Some' ? asked.value : [])
              .find(({ sessionId }) => sessionId === act.session)
              ?.questions.at(0);
            if (question === undefined) return 'No question waits there';
            yield* api.answerQuestion({
              sessionId: act.session,
              questionId: question.id,
              answer: firstChoices(question.items),
            });
            return 'Answered its question';
          }),
        );
      case 'RemoveAgentAccount':
        return yield* on(
          Effect.gen(function* () {
            const api = yield* CodeClient;
            const named = (yield* api.harnessAccounts()).find(
              ({ name }) => name === act.name.trim(),
            );
            if (named === undefined)
              return `No agent account named ${act.name.trim()}`;
            yield* api.removeHarnessAccount({ id: named.id });
            return `Removed agent account ${named.name}`;
          }),
        );
    }
  });
  return done.pipe(
    Effect.timeoutOrElse({
      duration: ANSWER,
      orElse: () => Effect.succeed(`No answer in ${ANSWER}`),
    }),
    Effect.catchCause((cause) =>
      Effect.succeed(`Failed: ${Cause.pretty(cause).split('\n')[0]}`),
    ),
  );
};

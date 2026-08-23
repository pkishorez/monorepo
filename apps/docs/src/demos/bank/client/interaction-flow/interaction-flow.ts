import { initFlow } from '@pkishorez/effect-tracer/flow';
import { Effect } from 'effect';

export type Lane = ReturnType<typeof initFlow>;

export type InteractionKind = 'transfer' | 'open' | 'seed' | 'clear';

export interface Telling<A, E> {
  readonly reply: (outcome: A) => string;
  readonly failure: (error: E) => string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface InteractionFlow {
  readonly id: string;
  readonly user: Lane;
  readonly bank: Lane;
  readonly api: Lane;
  readonly call: <A, E, R>(
    request: string,
    effect: Effect.Effect<A, E, R>,
    telling: Telling<A, E>,
  ) => Effect.Effect<A, E, R>;
}

export const makeInteractionFlow = (
  kind: InteractionKind,
  id: string,
): InteractionFlow => {
  const flowId = `${kind}:${id}`;
  const lane = (name: string) =>
    initFlow({ id: flowId, participantName: name });
  const user = lane('user');
  const bank = lane('bank');
  const api = lane('api');
  return {
    id: flowId,
    user,
    bank,
    api,
    call: (request, effect, telling) =>
      Effect.gen(function* () {
        const token = yield* bank.send('api', request, {
          attributes: telling.attributes,
        });
        return yield* api
          .activated({ name: request, attributes: telling.attributes })(effect)
          .pipe(
            Effect.tap((outcome) => api.reply(token, telling.reply(outcome))),
            Effect.tapError((error) =>
              api.reply(token, telling.failure(error), { level: 'error' }),
            ),
          );
      }),
  };
};

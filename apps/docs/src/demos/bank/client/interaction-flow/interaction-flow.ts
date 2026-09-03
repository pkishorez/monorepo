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

/** Whoever owns the Flow these lanes join — the Std Sync exposes exactly this. */
export interface FlowHost {
  readonly participant: (name: string) => Lane;
}

// The app's lanes sit under `<sync>/app/…` in the sync's own Flow, so one
// panel shows the user's ask, the bank's work, and the sync that carries it.
export const makeInteractionFlow = (
  host: FlowHost,
  kind: InteractionKind,
  id: string,
): InteractionFlow => {
  const flowId = `${kind}:${id}`;
  const user = host.participant('app/user');
  const bank = host.participant('app/bank');
  const api = host.participant('app/api');
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

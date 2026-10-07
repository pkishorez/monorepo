import { Duration, Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { sharedLeadership, todo, type Todo } from '../../__tests__/support.js';
import { noLeadership } from '../../store/contract/index.js';
import { strategy, type SyncStrategy } from '../../strategy/index.js';
import { runSession, type SessionConfig } from '../index.js';

type State = { n: number };

const counting = (
  run: SyncStrategy<Todo, State>['run'],
): SyncStrategy<Todo, State> =>
  strategy.make<Todo, State>({
    name: 'counting',
    state: () => null as never,
    initial: { n: 0 },
    run,
  });

const session = (
  overrides: Partial<SessionConfig<Todo, State, never>> &
    Pick<SessionConfig<Todo, State, never>, 'strategy'>,
): SessionConfig<Todo, State, never> => ({
  key: 'k',
  leadership: noLeadership,
  settleWindow: Duration.zero,
  load: Effect.succeed({ n: 0 }),
  commit: () => Effect.void,
  isFinal: () => Effect.succeed(false),
  onFailure: () => Effect.void,
  ...overrides,
});

describe('runSession', () => {
  it('stores every yield, then ends with the strategy', async () => {
    const stored: number[] = [];
    await Effect.runPromise(
      runSession(
        session({
          strategy: counting(({ state }) =>
            Stream.make(
              { entities: [todo('a', 1)], state: { n: state.n + 1 } },
              { entities: [], state: { n: state.n + 2 } },
            ),
          ),
          commit: ({ state }) => Effect.sync(() => void stored.push(state.n)),
        }),
      ),
    );
    expect(stored).toEqual([1, 2]);
  });

  it('reports a failure and runs again from saved state', async () => {
    let saved = 0;
    let loads = 0;
    const failures: unknown[] = [];
    await Effect.runPromise(
      runSession(
        session({
          load: Effect.sync(() => {
            loads += 1;
            return { n: saved };
          }),
          strategy: counting(({ state }) =>
            state.n === 0
              ? Stream.concat(
                  Stream.make({ entities: [], state: { n: 1 } }),
                  Stream.fail('network'),
                )
              : Stream.empty,
          ),
          commit: ({ state }) => Effect.sync(() => void (saved = state.n)),
          onFailure: (cause) => Effect.sync(() => void failures.push(cause)),
        }),
      ),
    );
    expect(loads).toBe(2);
    expect(failures).toHaveLength(1);
  });

  it('stops on a final failure without retrying', async () => {
    let runs = 0;
    await Effect.runPromise(
      runSession(
        session({
          strategy: counting(() => {
            runs += 1;
            return Stream.fail('outdated');
          }),
          isFinal: () => Effect.succeed(true),
        }),
      ),
    );
    expect(runs).toBe(1);
  });

  it('runs one Session per key at a time', async () => {
    const leadership = sharedLeadership();
    const log: string[] = [];
    const holding = (name: string) =>
      session({
        leadership,
        strategy: counting(() =>
          Stream.fromEffect(
            Effect.sync(() => log.push(`${name} start`)).pipe(
              Effect.andThen(Effect.sleep('20 millis')),
              Effect.andThen(Effect.sync(() => log.push(`${name} end`))),
              Effect.as({ entities: [], state: { n: 1 } }),
            ),
          ),
        ),
      });
    await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* Effect.forkChild(runSession(holding('one')));
        const second = yield* Effect.forkChild(runSession(holding('two')));
        yield* Fiber.join(first);
        yield* Fiber.join(second);
      }),
    );
    expect(log).toEqual(['one start', 'one end', 'two start', 'two end']);
  });
});

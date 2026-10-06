import { Effect, Layer } from 'effect';
import { Auth, Unreachable } from '@kstackz/auth-toolkit/clients/auth';
import { createEffectActor, send, waitFor } from '@xstate/effect';
import { describe, expect, it, vi } from 'vitest';
import type { Session, User } from '../../session/index.ts';
import { appMachine } from '../machine.ts';
import { Device, Sessions } from '../services.ts';

const user = (id: string): User => ({
  id,
  name: id,
  email: `${id}@example.com`,
  image: null,
});
const ada = user('ada');
const mary = user('mary');

/** A device whose sign-in service and storage are plain values a test moves. */
const world = (options: {
  signedIn: Array<{ user: User; active?: boolean }>;
  reachable?: boolean;
  lastUser?: User | null;
}) => {
  const state = {
    signedIn: options.signedIn,
    reachable: options.reachable ?? true,
    lastUser: options.lastUser ?? null,
    kept: [] as string[][],
    log: [] as string[],
    tokens: new Map<string, string | null>(),
  };
  const listed = () =>
    state.signedIn.map(({ user, active }) => ({
      user,
      token: `${user.id}-token`,
      active: active ?? false,
    }));
  const layer = Layer.mergeAll(
    Layer.succeed(Auth, {
      list: Effect.suspend(() =>
        state.reachable
          ? Effect.succeed(listed())
          : Effect.fail(new Unreachable({ reason: 'offline' })),
      ),
      signIn: () => Effect.void,
      switchTo: (token) =>
        Effect.sync(() => {
          state.log.push(`active ${token}`);
          state.signedIn = state.signedIn.map((entry) => ({
            ...entry,
            active: `${entry.user.id}-token` === token,
          }));
        }),
      signOut: (token) =>
        Effect.sync(() => {
          state.log.push(`sign out ${token}`);
          state.signedIn = state.signedIn.filter(
            ({ user }) => `${user.id}-token` !== token,
          );
        }),
      signOutAll: Effect.sync(() => {
        state.log.push('sign out everyone');
        state.signedIn = [];
      }),
      takeLoginError: Effect.succeed(null),
    }),
    Layer.succeed(Device, {
      lastUser: Effect.sync(() => state.lastUser),
      setLastUser: (last) =>
        Effect.sync(() => {
          state.lastUser = last;
        }),
      keepCopies: (ids) =>
        Effect.sync(() => {
          state.kept.push([...ids]);
        }),
    }),
    Layer.succeed(Sessions, {
      open: (opened, token) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            state.log.push(`open ${opened.id} ${token}`);
            state.tokens.set(opened.id, token);
            return {
              user: opened,
              userId: opened.id,
              setToken: (next: string) => {
                state.tokens.set(opened.id, next);
              },
            } as unknown as Session;
          }),
          () => Effect.sync(() => state.log.push(`close ${opened.id}`)),
        ),
    }),
  );
  return { state, layer };
};

const run = <A>(
  layer: Layer.Layer<Auth | Device | Sessions>,
  program: (
    actor: Effect.Success<
      ReturnType<typeof createEffectActor<typeof appMachine>>
    >,
  ) => Effect.Effect<A, unknown>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const actor = yield* createEffectActor(appMachine);
      return yield* program(actor);
    }).pipe(Effect.scoped, Effect.provide(layer)),
  );

const ready = { open: 'ready' } as const;
const openOn =
  (id: string) =>
  (snapshot: {
    matches: (s: never) => boolean;
    context: { session: Session | null };
  }) =>
    snapshot.matches(ready as never) && snapshot.context.session?.userId === id;

describe('the app machine', () => {
  it('shows signed out when nobody is signed in', async () => {
    const { layer, state } = world({ signedIn: [] });
    await run(layer, (actor) => waitFor(actor, (s) => s.matches('signedOut')));
    expect(state.kept).toEqual([[]]);
  });

  it("opens the active User's Session, signed with their token", async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada }, { user: mary, active: true }],
    });
    const snapshot = await run(layer, (actor) =>
      waitFor(actor, openOn('mary')),
    );
    expect(snapshot.context.signedIn.map(({ user }) => user.id)).toEqual([
      'ada',
      'mary',
    ]);
    expect(state.log).toEqual(['open mary mary-token', 'close mary']);
    expect(state.kept).toEqual([['ada', 'mary']]);
  });

  it('switches in every tab: closes one Session, opens the other', async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        yield* send(actor, { type: 'SWITCH', userId: 'mary' });
        yield* waitFor(actor, openOn('mary'));
      }),
    );
    expect(state.log).toEqual([
      'open ada ada-token',
      'close ada',
      'active mary-token',
      'open mary mary-token',
      'close mary',
    ]);
  });

  it('follows a switch made in another tab', async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        state.signedIn = [{ user: ada }, { user: mary, active: true }];
        yield* send(actor, { type: 'CHECK' });
        yield* waitFor(actor, openOn('mary'));
      }),
    );
    expect(state.log.slice(0, 3)).toEqual([
      'open ada ada-token',
      'close ada',
      'open mary mary-token',
    ]);
  });

  it('closes the Session and deletes every copy when everyone signed out elsewhere', async () => {
    const { layer, state } = world({ signedIn: [{ user: ada, active: true }] });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        state.signedIn = [];
        yield* send(actor, { type: 'CHECK' });
        yield* waitFor(actor, (s) => s.matches('signedOut'));
      }),
    );
    expect(state.log).toEqual(['open ada ada-token', 'close ada']);
    expect(state.kept.at(-1)).toEqual([]);
  });

  it('opens the last User offline with no token, and signs it once online', async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada, active: true }],
      reachable: false,
      lastUser: ada,
    });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        expect(state.tokens.get('ada')).toBeNull();
        state.reachable = true;
        yield* send(actor, { type: 'CHECK' });
        yield* waitFor(
          actor,
          (s) =>
            s.matches({ open: { ready: 'idle' } }) &&
            s.context.user?.token === 'ada-token',
        );
        // Actions run just after the snapshot that enqueued them.
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(state.tokens.get('ada')).toBe('ada-token')),
        );
      }),
    );
    expect(state.log).toEqual(['open ada null', 'close ada']);
    expect(state.kept).toEqual([['ada']]);
  });

  it('says the service is unreachable when nobody can open offline', async () => {
    const { layer } = world({ signedIn: [], reachable: false });
    const snapshot = await run(layer, (actor) =>
      waitFor(actor, (s) => s.matches('signedOut')),
    );
    expect(snapshot.context.unreachable).toBe(true);
  });

  it('signs out the open User, deletes their copy and opens who is left', async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        yield* send(actor, { type: 'SIGN_OUT' });
        yield* waitFor(actor, openOn('mary'));
      }),
    );
    expect(state.log).toEqual([
      'open ada ada-token',
      'close ada',
      'sign out ada-token',
      'open mary mary-token',
      'close mary',
    ]);
    expect(state.kept.at(-1)).toEqual(['mary']);
  });

  it('is signed out when the last User signs out', async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada, active: true }],
    });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        yield* send(actor, { type: 'SIGN_OUT' });
        yield* waitFor(actor, (s) => s.matches('signedOut'));
      }),
    );
    expect(state.kept.at(-1)).toEqual([]);
    expect(state.lastUser).toBeNull();
  });

  it('signs everyone out and deletes every copy', async () => {
    const { layer, state } = world({
      signedIn: [{ user: ada, active: true }, { user: mary }],
    });
    await run(layer, (actor) =>
      Effect.gen(function* () {
        yield* waitFor(actor, openOn('ada'));
        yield* send(actor, { type: 'SIGN_OUT_EVERYONE' });
        yield* waitFor(actor, (s) => s.matches('signedOut'));
      }),
    );
    expect(state.log).toContain('sign out everyone');
    expect(state.kept.at(-1)).toEqual([]);
    expect(state.lastUser).toBeNull();
  });
});

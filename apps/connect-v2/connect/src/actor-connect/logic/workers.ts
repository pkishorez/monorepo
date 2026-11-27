import { Duration, Effect, Stream } from 'effect';
import type { SelfOf, WorkersOf } from '@kestack/kabuki/types';
import { Cloud } from '../../services/cloud/contract/index.js';
import { Control } from '../../services/control/contract/index.js';
import { SignIn, SignInFailed } from '../../services/sign-in/contract/index.js';
import { Store } from '../../services/store/contract/index.js';
import {
  backoffAfter,
  type ConnectShape,
  samePlugins,
} from './shared/index.js';

type ConnectSelf = SelfOf<typeof ConnectShape>;
type SigningInSelf = SelfOf<typeof ConnectShape, 'SigningIn'>;
type SignedInSelf = SelfOf<typeof ConnectShape, 'SignedIn'>;

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

const signIn = (self: SigningInSelf) =>
  Effect.gen(function* () {
    const { model, state } = yield* self.get;
    const accounts = yield* SignIn;
    const store = yield* Store;
    const wait = backoffAfter(
      model.signIn.refusals,
      model.settings.firstRetryAfter,
    );
    if (state.who !== null)
      yield* Effect.logWarning(
        wait === 0
          ? 'Connect Cloud says the Sign-in is gone: the Tunnel and every Plugin are stopped until you sign in again.'
          : `Connect Cloud refused the Sign-in again: signing in again in ${Duration.format(Duration.millis(wait))}.`,
      );
    yield* Effect.sleep(Duration.millis(wait));
    const user =
      state.who === null
        ? ((yield* accounts.saved) ?? (yield* accounts.signIn))
        : yield* accounts.signInAgain;
    if (state.who !== null && user.id !== state.who.user.id)
      return yield* new SignInFailed({
        message: `Signed in as ${user.email}, but this Connection is ${state.who.user.email}'s. Serve another name.`,
      });
    const connection = yield* store.claim({
      owner: user,
      cloud: model.connection.cloud,
      name: model.connection.computerName,
      startedAt: Date.now(),
    });
    yield* Effect.log(`Connection ${connection.name} (${connection.id})`);
    yield* Effect.log(
      `Signed in as ${user.email} to ${model.connection.cloud}`,
    );
    yield* self.send({
      _tag: 'SignedIn',
      who: { user: { id: user.id, email: user.email }, connection },
    });
  }).pipe(
    Effect.catch((cause) =>
      self.send({ _tag: 'SignInFailed', reason: messageOf(cause) }),
    ),
    Effect.catchDefect((defect) =>
      self.send({ _tag: 'SignInFailed', reason: messageOf(defect) }),
    ),
  );

const report = (self: SignedInSelf) =>
  Effect.gen(function* () {
    const { model, state } = yield* self.get;
    if (model.address === null) return;
    const cloud = yield* Cloud;
    const answer = yield* cloud.report({
      id: state.who.connection.id,
      name: state.who.connection.name,
      version: model.connection.version,
      url: model.address.url,
      key: model.address.key,
    });
    switch (answer._tag) {
      case 'Enabled': {
        const now = yield* self.get;
        return samePlugins(now.model.plugins, answer.plugins)
          ? undefined
          : yield* self.send({
              _tag: 'EnabledPluginsChanged',
              plugins: answer.plugins,
            });
      }
      case 'Unsent':
        return yield* Effect.logWarning(
          `Heartbeat not sent: ${answer.problem}`,
        );
      case 'SignedOut':
        return yield* self.send({ _tag: 'SignedOut' });
      case 'Removed':
        return yield* self.send({ _tag: 'ConnectionRemoved' });
      case 'Outdated':
        return yield* self.send({ _tag: 'CliOutdated', line: answer.line });
    }
  });

const heartbeat = (self: SignedInSelf) =>
  Effect.flatMap(self.get, ({ model }) =>
    self.changes.pipe(
      Stream.map(({ model: now }) => now.address),
      Stream.filter((address) => address !== null),
      Stream.changesWith((a, b) => a.url === b.url && a.key === b.key),
      Stream.switchMap(() =>
        Stream.tick(Duration.millis(model.settings.heartbeatEvery)),
      ),
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.runForEach(() => report(self)),
    ),
  );

const control = (self: ConnectSelf) =>
  Effect.gen(function* () {
    const held = yield* Control;
    yield* held.answer({
      status: Effect.map(self.get, ({ model, state }) => ({
        name: model.connection.name,
        id: state._tag === 'SignedIn' ? state.who.connection.id : '',
        url: model.address?.url ?? null,
      })),
      stop: Effect.asVoid(self.send({ _tag: 'StopRequested' })),
    });
    return yield* Effect.never;
  }).pipe(Effect.scoped);

export const workers: WorkersOf<typeof ConnectShape> = {
  control: { run: control },
};

export const signingInWorkers: WorkersOf<typeof ConnectShape, 'SigningIn'> = {
  signIn: { run: signIn },
};

export const signedInWorkers: WorkersOf<typeof ConnectShape, 'SignedIn'> = {
  heartbeat: { run: heartbeat },
};

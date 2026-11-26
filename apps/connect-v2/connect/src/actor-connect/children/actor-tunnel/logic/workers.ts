import { randomBytes } from 'node:crypto';
import { Duration, Effect, Stream } from 'effect';
import type { SelfOf, WorkersOf } from '@kestack/kabuki/types';
import { Cloudflared } from '../../../../services/cloudflared/contract/index.js';
import { Server } from '../../../../services/server/contract/index.js';
import { routeOf, type TunnelShape } from './shared/index.js';

type TunnelSelf = SelfOf<typeof TunnelShape>;

const REOPEN_AFTER = Duration.seconds(5);

export const newKey = () => randomBytes(32).toString('base64url');

const server = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const listening = yield* Server;
    let now = yield* self.get;
    const first = newKey();
    const port = yield* Effect.result(
      listening.listen({
        port: now.model.settings.port,
        origins: now.model.settings.origins,
        key: () => now.model.key || first,
        route: (name, hash) => routeOf(now.props.routes, name, hash),
      }),
    );
    if (port._tag === 'Failure')
      return yield* self.send({
        _tag: 'PortFailed',
        reason: port.failure.message,
      });
    yield* Effect.log(`Listening on 127.0.0.1:${port.success}`);
    yield* self.send({ _tag: 'PortOpened', port: port.success, key: first });
    yield* self.changes.pipe(
      Stream.runForEach((data) =>
        Effect.sync(() => {
          now = data;
        }),
      ),
    );
  });

const cloudflared = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const tunnels = yield* Cloudflared;
    const { model } = yield* self.get;
    if (model.listening === null) return;
    const opened = yield* Effect.result(tunnels.open(model.listening));
    if (opened._tag === 'Failure') {
      yield* Effect.logWarning(
        `Could not open the tunnel: ${opened.failure.message}`,
      );
      yield* Effect.sleep(REOPEN_AFTER);
      return yield* self.send({ _tag: 'TunnelDown' });
    }
    yield* Effect.log(`Tunnel at ${opened.success.url}`);
    yield* self.send({ _tag: 'TunnelUp', url: opened.success.url });
    yield* opened.success.closed;
    yield* Effect.logWarning('cloudflared stopped; starting it again');
    yield* self.send({ _tag: 'TunnelDown' });
  }).pipe(Effect.scoped);

const reachability = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const tunnels = yield* Cloudflared;
    const { model, state } = yield* self.get;
    if (state._tag !== 'Active') return;
    yield* Effect.sleep(Duration.millis(model.settings.reachEvery));
    const reached = yield* tunnels.reachable(state.url);
    if (!reached)
      yield* Effect.logWarning(
        `The tunnel at ${state.url} could not be reached`,
      );
    yield* self.send({
      _tag: reached ? 'TunnelReachable' : 'TunnelUnreachable',
    });
  }).pipe(Effect.forever);

const keyRotation = (self: TunnelSelf) =>
  Effect.flatMap(self.get, ({ model }) =>
    Effect.sleep(Duration.millis(model.settings.rotateKeyEvery)).pipe(
      Effect.andThen(
        Effect.suspend(() => self.send({ _tag: 'KeyRotated', key: newKey() })),
      ),
      Effect.forever,
    ),
  );

export const workers: WorkersOf<typeof TunnelShape> = {
  server: { run: server },
  cloudflared: {
    each: ({ model }) =>
      model.listening === null ? [] : [String(model.opening)],
    run: cloudflared,
  },
  reachability: {
    while: ({ state }) => state._tag === 'Active',
    run: reachability,
  },
  keyRotation: {
    while: ({ model }) => model.listening !== null,
    run: keyRotation,
  },
};

import type * as cf from '@cloudflare/workers-types';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { Rpc } from '../rpc/index.ts';
import { socket, stores } from './harness.ts';

const request = (id: string): Rpc.StreamRequest => ({
  _tag: 'Request',
  id,
  tag: 'watch',
  payload: { from: 1 },
  headers: [['authorization', 'Bearer token']],
});
const run = Effect.runPromise;

describe.each(stores)('$name Stream Store', ({ make }) => {
  it('keeps a socket record, its streams and their checkpoints', async () => {
    const { store } = make();
    const streams = store();
    const s = socket();
    await run(streams.connect(s.port, 7, { userId: 'u1' }));
    await run(streams.start(s.port, 7, request('a')));
    await run(streams.start(s.port, 7, request('b')));
    await run(streams.putCheckpoint(s.port, 7, 'a', { cursor: 3 }));
    // Starting again (a replay) keeps the checkpoint.
    await run(streams.start(s.port, 7, request('a')));

    expect(
      Option.getOrThrow(await run(streams.getCheckpoint(s.port, 7, 'a'))),
    ).toEqual({ cursor: 3 });
    expect(
      Option.isNone(await run(streams.getCheckpoint(s.port, 7, 'b'))),
    ).toBe(true);

    const woken = s.hibernate();
    const saved = Option.getOrThrow(await run(store().load(woken.port)));
    expect(saved.clientId).toBe(7);
    expect(saved.connection).toEqual({ userId: 'u1' });
    expect(
      saved.streams.map(({ request, checkpoint }) => [
        request,
        Option.getOrUndefined(checkpoint),
      ]),
    ).toEqual(
      expect.arrayContaining([
        [request('a'), { cursor: 3 }],
        [request('b'), undefined],
      ]),
    );
  });

  it('forgets an ended stream and never brings it back on a late checkpoint', async () => {
    const { store } = make();
    const streams = store();
    const s = socket();
    await run(streams.connect(s.port, 1, undefined));
    await run(streams.start(s.port, 1, request('a')));
    await run(streams.end(s.port, 1, 'a'));
    await run(streams.putCheckpoint(s.port, 1, 'a', 5));
    await run(streams.end(s.port, 1, 'never-started'));

    const saved = Option.getOrThrow(await run(store().load(s.port)));
    expect(saved.streams).toEqual([]);
    expect(saved.connection).toBeUndefined();
  });

  it('reports a missing record as None', async () => {
    const { store } = make();
    expect(Option.isNone(await run(store().load(socket().port)))).toBe(true);
    expect(
      Option.isNone(await run(store().load(socket({ garbage: true }).port))),
    ).toBe(true);
  });
});

describe('sqlite Stream Store', () => {
  const [, sqlite] = stores;

  it('is built from a raw workerd DurableObjectState', () => {
    // Typechecked: workerd's `state.storage` is accepted as is.
    const fromRaw = (state: cf.DurableObjectState) =>
      Rpc.websocket.streams.sqlite({ storage: state.storage });
    expect(typeof fromRaw).toBe('function');
  });

  it('keeps only the client id in the attachment', async () => {
    const { store } = sqlite.make();
    const s = socket();
    await run(store().connect(s.port, 9, { token: 'x'.repeat(4096) }));
    expect(s.port.deserializeAttachment()).toEqual({ clientId: 9 });
  });

  it('hard-deletes a closed socket and every stream on it', async () => {
    const { store, rows } = sqlite.make();
    const streams = store();
    const s = socket();
    await run(streams.connect(s.port, 1, undefined));
    await run(streams.start(s.port, 1, request('a')));
    await run(streams.start(s.port, 1, request('b')));
    await run(streams.end(s.port, 1, 'a'));
    expect(rows()).toBe(2);
    await run(streams.forget(s.port, 1));
    expect(rows()).toBe(0);
    expect(Option.isNone(await run(store().load(s.port)))).toBe(true);
  });

  it('reconciles on boot: hard-deletes rows of sockets that are not live', async () => {
    const { store, rows } = sqlite.make();
    const streams = store();
    const [live, gone] = [socket(), socket()];
    await run(streams.connect(live.port, 1, undefined));
    await run(streams.start(live.port, 1, request('a')));
    await run(streams.connect(gone.port, 2, undefined));
    await run(streams.start(gone.port, 2, request('a')));
    await run(streams.start(gone.port, 2, request('b')));
    expect(rows()).toBe(5);

    await run(store().reconcile(new Set([1])));
    expect(rows()).toBe(2);
    expect(Option.isSome(await run(store().load(live.port)))).toBe(true);
    expect(Option.isNone(await run(store().load(gone.port)))).toBe(true);
  });

  it('creates its table on a fresh database, under a chosen name', async () => {
    const { durableObjectStorage } = await import('./harness.ts');
    const { storage, database } = durableObjectStorage();
    const streams = Rpc.websocket.streams.sqlite({
      storage,
      tableName: 'my_streams',
    });
    await run(streams.connect(socket().port, 1, undefined));
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(({ name }) => name),
    ).toContain('my_streams');
  });
});

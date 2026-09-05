import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ConnectionAttachment,
  decodeConnectionAttachment,
  findHandler,
  PersistedHandler,
  putHandler,
  removeHandler,
} from './attachment.ts';
import { makeStreamCheckpoint } from './checkpoint.ts';

const request = {
  _tag: 'Request',
  id: '1',
  tag: 'stream',
  payload: undefined,
  headers: [],
} as const;

describe('StreamCheckpoint', () => {
  it('opts in, replaces state, and clears without requiring a schema', async () => {
    let attachment = new ConnectionAttachment({
      clientId: 1,
      handlers: [],
    });
    const checkpoint = makeStreamCheckpoint({
      get: () =>
        findHandler(attachment, request.id).pipe(
          Option.map(({ state }) => state),
        ),
      put: (state) => {
        attachment = putHandler(
          attachment,
          new PersistedHandler({ request, state }),
        );
      },
      clear: () => {
        attachment = removeHandler(attachment, request.id);
      },
    });

    await Effect.runPromise(checkpoint.put(undefined));
    expect((await Effect.runPromise(checkpoint.get()))._tag).toBe('Some');

    await Effect.runPromise(checkpoint.put({ cursor: 2 }));
    expect(
      Option.getOrThrow(await Effect.runPromise(checkpoint.get())),
    ).toEqual({ cursor: 2 });

    await Effect.runPromise(checkpoint.clear);
    expect((await Effect.runPromise(checkpoint.get()))._tag).toBe('None');
  });
});

describe('connection slot', () => {
  const Identity = Schema.Struct({ userId: Schema.String });

  it('round-trips an opaque connection value through the attachment', () => {
    const stored = new ConnectionAttachment({
      clientId: 7,
      handlers: [],
      connection: { userId: 'u1' },
    });

    const decoded = decodeConnectionAttachment(
      JSON.parse(JSON.stringify(stored)),
      99,
    );

    expect(decoded.clientId).toBe(7);
    expect(
      Option.getOrThrow(
        Schema.decodeUnknownOption(Identity)(decoded.connection),
      ),
    ).toEqual({ userId: 'u1' });
  });

  it('reports no connection when the socket has never carried one', () => {
    const decoded = decodeConnectionAttachment(
      JSON.parse(
        JSON.stringify(new ConnectionAttachment({ clientId: 7, handlers: [] })),
      ),
      99,
    );

    expect(decoded.connection).toBeUndefined();
  });

  it('falls back to a fresh attachment when the stored value is unusable', () => {
    const decoded = decodeConnectionAttachment({ garbage: true }, 42);

    expect(decoded.clientId).toBe(42);
    expect(decoded.handlers).toEqual([]);
    expect(decoded.connection).toBeUndefined();
  });

  it('reads the legacy `identity` key written before the rename', () => {
    const decoded = decodeConnectionAttachment(
      { clientId: 7, handlers: [], identity: { userId: 'u1' } },
      99,
    );

    expect(decoded.connection).toEqual({ userId: 'u1' });
  });
});

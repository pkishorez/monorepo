import { Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ConnectionAttachment,
  decodeConnectionAttachment,
} from './attachment.ts';

describe('connection slot', () => {
  const Identity = Schema.Struct({ userId: Schema.String });

  it('round-trips an opaque connection value through the attachment', () => {
    const stored = new ConnectionAttachment({
      clientId: 7,
      handlers: [],
      connection: { userId: 'u1' },
    });

    const decoded = Option.getOrThrow(
      decodeConnectionAttachment(JSON.parse(JSON.stringify(stored))),
    );

    expect(decoded.clientId).toBe(7);
    expect(
      Option.getOrThrow(
        Schema.decodeUnknownOption(Identity)(decoded.connection),
      ),
    ).toEqual({ userId: 'u1' });
  });

  it('reports no connection when the socket has never carried one', () => {
    const decoded = Option.getOrThrow(
      decodeConnectionAttachment(
        JSON.parse(
          JSON.stringify(
            new ConnectionAttachment({ clientId: 7, handlers: [] }),
          ),
        ),
      ),
    );

    expect(decoded.connection).toBeUndefined();
  });

  it('counts an attachment that cannot be decoded as missing', () => {
    expect(Option.isNone(decodeConnectionAttachment({ garbage: true }))).toBe(
      true,
    );
    expect(Option.isNone(decodeConnectionAttachment(null))).toBe(true);
  });

  it('reads the legacy `identity` key written before the rename', () => {
    const decoded = Option.getOrThrow(
      decodeConnectionAttachment({
        clientId: 7,
        handlers: [],
        identity: { userId: 'u1' },
      }),
    );

    expect(decoded.connection).toEqual({ userId: 'u1' });
  });
});

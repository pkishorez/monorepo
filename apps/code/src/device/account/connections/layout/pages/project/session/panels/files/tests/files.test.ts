import { Effect, Layer, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import {
  FILE_TICKET_LIFETIME_MS,
  FileMissing,
  FilesAddress,
  FilesClient,
  FilesClients,
  UnsupportedFile,
} from '@kestack/connect/files';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import { requestFile, UNREACHED } from '../commands.ts';
import {
  asking,
  broke,
  embedOf,
  type Entry,
  given,
  keeping,
  keyOf,
  type Kept,
  none,
  NOT_LOADED,
  REFUSED_FOR,
  refused,
  RENEW_BEFORE,
  type Ticket,
  wanted,
  wants,
} from '../files.ts';

/*
 * A File Embed's ticket is asked for once it comes into view, kept until
 * five minutes before its end, asked again then, and once more when its
 * URL fails to load; a refusal is kept a while, then asked again.
 */

const HOUR = 60 * 60 * 1000;

const ticket = (url = 'https://m1.test/files/public/t/chart.png'): Ticket => ({
  path: '/work/out/chart.png',
  name: 'chart.png',
  kind: 'image',
  mime: 'image/png',
  size: 2048,
  url,
  expiresAt: HOUR,
});

const embed = {
  message: 'r1',
  connectionId: 'm1',
  base: '/work',
  path: 'out/chart.png',
};

describe('a ticket kept', () => {
  it('is asked for when there is none, and only once while asked', () => {
    expect(wants(undefined, 0)).toBe(true);
    const asked = wanted(undefined, 0);
    expect(asked).toEqual({ _tag: 'Asking', retried: false });
    expect(wants(asked, 0)).toBe(false);
    expect(wanted(asked, 0)).toBe(asked);
  });

  it('is used until five minutes before its end, then asked for again', () => {
    const kept = given({ _tag: 'Asking', retried: false }, ticket());
    expect(kept?._tag).toBe('Given');
    expect(wants(kept, HOUR - RENEW_BEFORE - 1)).toBe(false);
    expect(wanted(kept, HOUR - RENEW_BEFORE - 1)).toBe(kept);
    expect(wants(kept, HOUR - RENEW_BEFORE)).toBe(true);
    expect(wanted(kept, HOUR - RENEW_BEFORE)).toEqual({
      _tag: 'Asking',
      retried: false,
    });
  });

  it('keeps a refusal a while, then asks again', () => {
    const said = refused({ _tag: 'Asking', retried: false }, 'Missing', 1000);
    expect(said).toEqual({ _tag: 'Refused', reason: 'Missing', at: 1000 });
    expect(wants(said, 1000 + REFUSED_FOR - 1)).toBe(false);
    expect(wants(said, 1000 + REFUSED_FOR)).toBe(true);
  });

  it('takes an answer only while asked', () => {
    const kept: Entry = { _tag: 'Given', ticket: ticket(), retried: false };
    expect(given(kept, ticket('https://other'))).toBe(kept);
    expect(refused(kept, 'Missing', 0)).toBe(kept);
    expect(given(undefined, ticket())).toBeUndefined();
  });
});

describe('a ticket whose URL failed to load', () => {
  it('is asked again once, and said not to load after that', () => {
    const url = ticket().url;
    const kept: Entry = { _tag: 'Given', ticket: ticket(), retried: false };
    const again = broke(kept, url, 5);
    expect(again).toEqual({ _tag: 'Asking', retried: true });
    const second = given(again, ticket());
    expect(second).toEqual({ _tag: 'Given', ticket: ticket(), retried: true });
    expect(broke(second, url, 9)).toEqual({
      _tag: 'Refused',
      reason: NOT_LOADED,
      at: 9,
    });
  });

  it('changes nothing for a URL no longer kept', () => {
    const kept: Entry = { _tag: 'Given', ticket: ticket(), retried: false };
    expect(broke(kept, 'https://old', 5)).toBe(kept);
    expect(broke(undefined, 'https://old', 5)).toBeUndefined();
  });
});

describe('the page keeping them', () => {
  const page = (files: Kept = none) => ({ model: { files } });

  it('keys each by Message, Connection, base and path, and asks each one wanted', () => {
    const key = keyOf(embed);
    expect(embedOf(key)).toEqual(embed);
    for (const other of [
      { message: 'r2' },
      { connectionId: 'm2' },
      { base: '/other' },
      { path: 'out/other.png' },
    ])
      expect(keyOf({ ...embed, ...other })).not.toBe(key);
    const next = keeping.on.FileWanted({ ...embed, at: 0 }, page());
    expect(next.model?.files.tickets[key]).toEqual({
      _tag: 'Asking',
      retried: false,
    });
    expect(asking(next.model!.files)).toEqual([key]);
    // Wanted again while asked: nothing changes.
    expect(
      keeping.on.FileWanted({ ...embed, at: 0 }, { model: next.model! }),
    ).toEqual({});
  });

  it('opens one in the viewer, asking again for a ticket near its end', () => {
    const key = keyOf(embed);
    const files: Kept = {
      tickets: { [key]: { _tag: 'Given', ticket: ticket(), retried: false } },
      viewing: null,
    };
    const opened = keeping.on.FileOpened(
      { ...embed, caption: 'The chart', at: HOUR - 1000 },
      page(files),
    );
    expect(opened.model.files.viewing).toEqual({
      ...embed,
      caption: 'The chart',
    });
    expect(opened.model.files.tickets[key]?._tag).toBe('Asking');
    const closed = keeping.on.FileClosed({}, page(opened.model.files));
    expect(closed.model?.files.viewing).toBeNull();
  });
});

describe('asking the files Plugin', () => {
  /** A Connection whose files Plugin answers with `answer`, at `wss://m1.test/…`. */
  const answering = (
    answer: (path: string) => Effect.Effect<unknown, unknown>,
  ) =>
    Layer.mergeAll(
      FilesClients.make(() =>
        Layer.mergeAll(
          Layer.mock(FilesClient)({
            requestFile: (({ path }: { readonly path: string }) =>
              answer(path)) as FilesClient['Service']['requestFile'],
          }),
          Layer.mock(RpcConnection)({
            connectionStatus: Stream.concat(
              Stream.make('connected' as const),
              Stream.never,
            ),
            keepSubscribed: (subscribe) => subscribe(),
            hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
          }),
        ),
      ),
      Layer.succeed(
        FilesAddress,
        FilesAddress.of({
          of: () =>
            Effect.succeed({
              url: `wss://m1.test/files/${'f'.repeat(64)}/rpc`,
            }),
        }),
      ),
    );

  /** The answer to an ask whose ticket the Connection says ends at `expiresAt`, received at `now` by this browser's clock. */
  const receivedAt = (now: number, expiresAt: number) =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(now);
        return yield* requestFile(embed).pipe(
          Effect.provide(
            answering(() =>
              Effect.succeed({
                ...ticket('/files/public/t/chart.png'),
                expiresAt,
              }),
            ),
          ),
        );
      }).pipe(Effect.provide(TestClock.layer())),
    );

  it('keeps a ticket with the URL a browser opens it at, ending a lifetime after it came', async () => {
    expect(await receivedAt(0, HOUR)).toEqual({
      _tag: 'Given',
      ticket: ticket('https://m1.test/files/public/t/chart.png'),
    });
  });

  it('never reads its end from the clock of the Connection', async () => {
    const now = 1_000 * HOUR;
    // The Connection's clock is a day behind, or a day ahead: its end is
    // still an hour after the answer came, by this browser's clock.
    for (const skew of [-24 * HOUR, 24 * HOUR]) {
      const answer = await receivedAt(now, now + skew + HOUR);
      expect(answer).toMatchObject({
        _tag: 'Given',
        ticket: { expiresAt: now + FILE_TICKET_LIFETIME_MS },
      });
      const kept = given(
        { _tag: 'Asking', retried: false },
        (answer as { readonly ticket: Ticket }).ticket,
      );
      expect(wants(kept, now)).toBe(false);
      expect(wants(kept, now + HOUR - RENEW_BEFORE - 1)).toBe(false);
      expect(wants(kept, now + HOUR - RENEW_BEFORE)).toBe(true);
    }
  });

  it('says why there is none, as a person reads it', async () => {
    const refusedWith = (error: unknown) =>
      Effect.runPromise(
        requestFile(embed).pipe(
          Effect.provide(answering(() => Effect.fail(error))),
        ),
      );
    expect(
      await refusedWith(new FileMissing({ path: '/work/out/chart.png' })),
    ).toMatchObject({ _tag: 'Refused', reason: 'Missing' });
    expect(
      await refusedWith(
        new UnsupportedFile({ path: '/work/notes.txt', extension: 'txt' }),
      ),
    ).toMatchObject({ _tag: 'Refused', reason: 'Unsupported .txt' });
    expect(await refusedWith({ _tag: 'VersionGap' })).toMatchObject({
      _tag: 'Refused',
      reason: UNREACHED,
    });
  });
});

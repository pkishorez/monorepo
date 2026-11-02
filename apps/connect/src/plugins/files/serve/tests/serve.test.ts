import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { type IncomingHttpHeaders, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock, Context, Duration, Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { RpcTest } from 'effect/rpc';
import { TestClock } from 'effect/testing';
import { NodeHttpServer } from '@effect/platform-node';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FILE_TICKET_LIFETIME_MS,
  FILES_PLUGIN,
  FilesApi,
  type FileTicket,
} from '../../api/contract/index.js';
import { filesPlugin } from '../index.js';
import { matches, SANDBOX, versionOf } from '../routes.js';
import { Tickets } from '../tickets.js';

/*
 * The files Plugin as Plugin.make serves it: `requestFile` through its
 * handlers, and its Public Area on a real socket, asked as the router
 * passes a request on, `/files/public/…` as `/public/…`. Its Tickets keep
 * a test's Clock, so a ticket ends when the test says. The router in
 * front of it, and the Public Area's guard, are tested where they are.
 */

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) {
    chmodSync(made, 0o700);
    rmSync(made, { recursive: true, force: true });
  }
});

/** A new folder, its symlinks resolved, as `requestFile` answers paths. */
const folder = () => {
  const made = realpathSync(mkdtempSync(join(tmpdir(), 'files-')));
  folders.push(made);
  return made;
};

/** Writes `bytes` at `path`, and answers it. */
const written = (path: string, bytes: string | Buffer = '0123456789') => {
  writeFileSync(path, bytes);
  return path;
};

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/** Asks the Plugin's socket for `path` as written. */
const askAt =
  (socket: string) =>
  (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    Effect.promise(
      () =>
        new Promise<Answer>((done, failed) => {
          const asked = request(
            { socketPath: socket, path, method, headers },
            (r) => {
              const chunks: Array<Buffer> = [];
              r.on('data', (chunk: Buffer) => chunks.push(chunk));
              r.on('end', () =>
                done({
                  status: r.statusCode ?? 0,
                  headers: r.headers,
                  body: Buffer.concat(chunks).toString(),
                }),
              );
            },
          );
          asked.on('error', failed);
          asked.end();
        }),
    );

/** Where the Plugin is asked for a ticket's URL: without `/files`, as the router passes it on. */
const onSocket = (ticket: FileTicket) => {
  const prefix = `/${FILES_PLUGIN}`;
  expect(ticket.url.startsWith(`${prefix}/public/`)).toBe(true);
  return ticket.url.slice(prefix.length);
};

/**
 * Runs `test` against the files Plugin, its Tickets on a TestClock, `~`
 * being `home`: its client, its socket, and the clock.
 */
const withPlugin = <A, E>(
  test: (plugin: {
    readonly home: string;
    readonly requestFile: (
      base: string,
      path: string,
    ) => Effect.Effect<FileTicket, unknown>;
    readonly ask: ReturnType<typeof askAt>;
    readonly clock: Effect.Success<ReturnType<typeof TestClock.make>>;
    readonly kept: Effect.Effect<number>;
  }) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const home = folder();
        const clock = yield* TestClock.make();
        const plugin = filesPlugin({ home });
        const services = yield* Layer.build(
          plugin.layer.pipe(Layer.provide(Layer.succeed(Clock.Clock, clock))),
        );
        const client = yield* RpcTest.makeClient(FilesApi).pipe(
          Effect.provideContext(services),
        );
        const socket = join(folder(), 'files.sock');
        yield* Layer.build(
          HttpRouter.serve(
            HttpRouter.addAll(plugin.publicRoutes, { prefix: '/public' }),
            { disableLogger: true, disableListenLog: true },
          ).pipe(
            Layer.provide(Layer.succeedContext(services)),
            Layer.provide(
              NodeHttpServer.layer(createServer, {
                path: socket,
                gracefulShutdownTimeout: Duration.seconds(1),
              }),
            ),
          ),
        );
        const tickets = Context.get(services, Tickets);
        return yield* test({
          home,
          requestFile: (base, path) => client.requestFile({ base, path }),
          ask: askAt(socket),
          clock,
          kept: tickets.size,
        });
      }),
    ),
  );

/** Why `requestFile` gave no ticket: the error it failed with. */
const refusal = <E>(asked: Effect.Effect<FileTicket, E>) => Effect.flip(asked);

describe('requestFile', () => {
  it('reads a leading ~ from home, keeps an absolute path, and reads a relative one from its base', () =>
    withPlugin(({ home, requestFile }) =>
      Effect.gen(function* () {
        const picture = written(join(home, 'chart.png'));
        const elsewhere = folder();
        mkdirSync(join(elsewhere, 'out'));
        const report = written(join(elsewhere, 'out', 'report.pdf'));

        const fromHome = yield* requestFile('/nowhere', '~/chart.png');
        expect(fromHome).toMatchObject({
          path: picture,
          name: 'chart.png',
          kind: 'image',
          mime: 'image/png',
          size: 10,
        });
        expect(fromHome.url).toMatch(
          /^\/files\/public\/[A-Za-z0-9_-]{43}\/chart\.png$/,
        );
        expect(yield* requestFile('/nowhere', picture)).toMatchObject({
          path: picture,
        });
        expect(yield* requestFile(elsewhere, 'out/report.pdf')).toMatchObject({
          path: report,
          kind: 'pdf',
          mime: 'application/pdf',
        });
        expect(
          yield* requestFile(join(elsewhere, 'out'), '../out/./report.pdf'),
        ).toMatchObject({ path: report });
        expect(yield* requestFile('~', 'chart.png')).toMatchObject({
          path: picture,
        });
      }),
    ));

  it('refuses a relative path read from a relative base', () =>
    withPlugin(({ requestFile }) =>
      Effect.gen(function* () {
        const error = yield* refusal(requestFile('some/folder', 'chart.png'));
        expect(error).toMatchObject({
          _tag: 'FileUnreadable',
          path: 'chart.png',
        });
      }),
    ));

  it('gives every ticket a token of its own, ending an hour after it was given', () =>
    withPlugin(({ home, requestFile, clock }) =>
      Effect.gen(function* () {
        written(join(home, 'chart.png'));
        const first = yield* requestFile(home, 'chart.png');
        yield* clock.adjust('10 minutes');
        const second = yield* requestFile(home, 'chart.png');
        expect(second.url).not.toBe(first.url);
        expect(first.expiresAt).toBe(FILE_TICKET_LIFETIME_MS);
        expect(second.expiresAt).toBe(FILE_TICKET_LIFETIME_MS + 10 * 60 * 1000);
      }),
    ));

  it('decides the kind by the file a symlink names, not the name asked for', () =>
    withPlugin(({ home, requestFile }) =>
      Effect.gen(function* () {
        const secret = written(join(home, 'id_rsa'), 'PRIVATE KEY');
        symlinkSync(secret, join(home, 'x.png'));
        expect(yield* refusal(requestFile(home, 'x.png'))).toMatchObject({
          _tag: 'UnsupportedFile',
          path: secret,
          extension: '',
        });
        const notes = written(join(home, 'notes.txt'));
        symlinkSync(notes, join(home, 'notes.md'));
        expect(yield* refusal(requestFile(home, 'notes.md'))).toMatchObject({
          _tag: 'UnsupportedFile',
          path: notes,
          extension: 'txt',
        });
        const picture = written(join(home, 'real.png'));
        symlinkSync(picture, join(home, 'link.txt'));
        expect(yield* requestFile(home, 'link.txt')).toMatchObject({
          path: picture,
          name: 'real.png',
          kind: 'image',
        });
      }),
    ));

  it('says when nothing is there, and when it is not a file', () =>
    withPlugin(({ home, requestFile }) =>
      Effect.gen(function* () {
        expect(yield* refusal(requestFile(home, 'gone.png'))).toMatchObject({
          _tag: 'FileMissing',
          path: join(home, 'gone.png'),
        });
        mkdirSync(join(home, 'album.png'));
        expect(yield* refusal(requestFile(home, 'album.png'))).toMatchObject({
          _tag: 'NotAFile',
          path: join(home, 'album.png'),
        });
        symlinkSync(join(home, 'nowhere.png'), join(home, 'dangling.png'));
        expect(yield* refusal(requestFile(home, 'dangling.png'))).toMatchObject(
          { _tag: 'FileMissing' },
        );
      }),
    ));

  it.skipIf(process.getuid?.() === 0)('says when the file cannot be read', () =>
    withPlugin(({ home, requestFile }) =>
      Effect.gen(function* () {
        const locked = written(join(home, 'locked.png'));
        chmodSync(locked, 0o000);
        expect(yield* refusal(requestFile(home, 'locked.png'))).toMatchObject({
          _tag: 'FileUnreadable',
          path: locked,
        });
      }),
    ),
  );
});

describe('the Public Area', () => {
  it('serves a ticket with its MIME type, nothing to guess, no referrer, and any origin', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        written(join(home, 'chart.png'));
        const ticket = yield* requestFile(home, 'chart.png');
        const answer = yield* ask(onSocket(ticket));
        expect(answer.status).toBe(200);
        expect(answer.body).toBe('0123456789');
        expect(answer.headers).toMatchObject({
          'content-type': 'image/png',
          'content-length': '10',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'accept-ranges': 'bytes',
          'content-disposition': `inline; filename="chart.png"; filename*=UTF-8''chart.png`,
          'cache-control': 'private, no-cache',
          'access-control-allow-origin': '*',
        });
        expect(answer.headers.etag).toMatch(/^"[0-9a-z-]+"$/);
        expect(answer.headers['last-modified']).toMatch(/ GMT$/);
        expect(answer.headers['content-security-policy']).toBeUndefined();
      }),
    ));

  it('sandboxes HTML and SVG, with no same-origin, and nothing else', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        const policies: Record<string, string | undefined> = {};
        for (const name of [
          'page.html',
          'page.htm',
          'logo.svg',
          'notes.md',
          'clip.mp4',
          'report.pdf',
        ]) {
          written(join(home, name), '<p>hi</p>');
          const ticket = yield* requestFile(home, name);
          const answer = yield* ask(onSocket(ticket));
          expect(answer.status).toBe(200);
          policies[name] = answer.headers['content-security-policy'] as
            | string
            | undefined;
        }
        expect(policies).toEqual({
          'page.html': SANDBOX,
          'page.htm': SANDBOX,
          'logo.svg': SANDBOX,
          'notes.md': undefined,
          'clip.mp4': undefined,
          'report.pdf': undefined,
        });
        expect(SANDBOX).not.toContain('allow-same-origin');
      }),
    ));

  it('names a file that is not plain ASCII both ways, and serves a long name', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        written(join(home, 'résumé "final".pdf'));
        const ticket = yield* requestFile(home, 'résumé "final".pdf');
        const answer = yield* ask(onSocket(ticket));
        expect(answer.status).toBe(200);
        expect(answer.headers['content-disposition']).toBe(
          `inline; filename="r_sum_ _final_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22.pdf`,
        );
        const long = `${'é'.repeat(120)}.png`;
        written(join(home, long));
        const longTicket = yield* requestFile(home, long);
        expect((yield* ask(onSocket(longTicket))).status).toBe(200);
      }),
    ));

  it('answers 404 alike for an unknown token, another filename, or a file swapped since', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        const picture = written(join(home, 'chart.png'));
        const ticket = yield* requestFile(home, 'chart.png');
        const at = onSocket(ticket);
        const token = at.split('/')[2]!;
        const unknown = yield* ask(`/public/${'A'.repeat(43)}/chart.png`);
        const renamed = yield* ask(`/public/${token}/other.png`);
        const noName = yield* ask(`/public/${token}`);
        for (const answer of [unknown, renamed, noName]) {
          expect(answer.status).toBe(404);
          expect(answer.body).toBe('');
        }
        expect((yield* ask(at)).status).toBe(200);

        written(join(home, 'next.png'), 'swapped in');
        renameSync(join(home, 'next.png'), picture);
        expect(yield* ask(at)).toMatchObject({ status: 404, body: '' });
      }),
    ));

  it('answers 404 once the file is a symlink, even to itself', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        const picture = written(join(home, 'chart.png'));
        const ticket = yield* requestFile(home, 'chart.png');
        renameSync(picture, join(home, 'moved.png'));
        symlinkSync(join(home, 'moved.png'), picture);
        expect((yield* ask(onSocket(ticket))).status).toBe(404);
      }),
    ));

  it('ends a ticket an hour after it was given, however much it is used, and sweeps it away', () =>
    withPlugin(({ home, requestFile, ask, clock, kept }) =>
      Effect.gen(function* () {
        written(join(home, 'chart.png'));
        const ticket = yield* requestFile(home, 'chart.png');
        const unused = yield* requestFile(home, 'chart.png');
        expect(yield* kept).toBe(2);
        yield* clock.adjust(Duration.millis(60 * 60 * 1000 - 1));
        expect((yield* ask(onSocket(ticket))).status).toBe(200);
        yield* clock.adjust(Duration.millis(1));
        expect((yield* ask(onSocket(ticket))).status).toBe(404);
        expect(unused.expiresAt).toBe(FILE_TICKET_LIFETIME_MS);
        yield* clock.adjust('5 minutes');
        expect(yield* kept).toBe(0);
      }),
    ));

  it('answers one Range with 206, one past the end with 416, and none with the whole file', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        written(join(home, 'clip.mp4'));
        const at = onSocket(yield* requestFile(home, 'clip.mp4'));
        const range = (header: string) => ask(at, { range: header });

        for (const [header, body, sent] of [
          ['bytes=2-5', '2345', 'bytes 2-5/10'],
          ['bytes=7-', '789', 'bytes 7-9/10'],
          ['bytes=-3', '789', 'bytes 7-9/10'],
          ['bytes=-30', '0123456789', 'bytes 0-9/10'],
          ['bytes=5-100', '56789', 'bytes 5-9/10'],
          ['bytes=0-0', '0', 'bytes 0-0/10'],
        ] as const) {
          const answer = yield* range(header);
          expect(answer, header).toMatchObject({ status: 206, body });
          expect(answer.headers['content-range'], header).toBe(sent);
          expect(answer.headers['content-length'], header).toBe(
            String(body.length),
          );
          expect(answer.headers['content-type'], header).toBe('video/mp4');
        }

        for (const header of ['bytes=10-', 'bytes=99-100', 'bytes=-0']) {
          const answer = yield* range(header);
          expect(answer, header).toMatchObject({ status: 416, body: '' });
          expect(answer.headers['content-range'], header).toBe('bytes */10');
          expect(answer.headers['x-content-type-options']).toBe('nosniff');
        }

        for (const header of ['bytes=0-1,4-5', 'bytes=5-2', 'items=0-1']) {
          const answer = yield* range(header);
          expect(answer, header).toMatchObject({
            status: 200,
            body: '0123456789',
          });
          expect(answer.headers['content-range']).toBeUndefined();
        }
      }),
    ));

  it('answers HEAD as GET, without the body', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        written(join(home, 'clip.mp4'));
        const at = onSocket(yield* requestFile(home, 'clip.mp4'));
        const whole = yield* ask(at, {}, 'HEAD');
        expect(whole).toMatchObject({ status: 200, body: '' });
        expect(whole.headers).toMatchObject({
          'content-length': '10',
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
        });
        const part = yield* ask(at, { range: 'bytes=2-5' }, 'HEAD');
        expect(part).toMatchObject({ status: 206, body: '' });
        expect(part.headers).toMatchObject({
          'content-length': '4',
          'content-range': 'bytes 2-5/10',
        });
      }),
    ));

  it('answers 304, headers kept and no body, when If-None-Match names the file as it is now', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        const page = written(join(home, 'page.html'), '<p>one</p>');
        const at = onSocket(yield* requestFile(home, 'page.html'));
        const first = yield* ask(at);
        const etag = first.headers.etag as string;
        for (const header of [etag, `W/${etag}`, `"x", ${etag}`, '*']) {
          const again = yield* ask(at, { 'if-none-match': header });
          expect(again, header).toMatchObject({ status: 304, body: '' });
          expect(again.headers, header).toMatchObject({
            etag,
            'cache-control': 'private, no-cache',
            'last-modified': first.headers['last-modified'],
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': SANDBOX,
          });
        }
        const ranged = yield* ask(at, {
          'if-none-match': etag,
          range: 'bytes=0-1',
        });
        expect(ranged.status).toBe(304);
        expect((yield* ask(at, { 'if-none-match': '"other"' })).status).toBe(
          200,
        );

        // Written again in place: the same inode, another version.
        writeFileSync(page, '<p>two, longer</p>');
        utimesSync(page, new Date(), new Date(Date.now() + 5_000));
        const rewritten = yield* ask(at, { 'if-none-match': etag });
        expect(rewritten).toMatchObject({
          status: 200,
          body: '<p>two, longer</p>',
        });
        expect(rewritten.headers.etag).not.toBe(etag);
      }),
    ));

  it('closes the file of every answer without a body', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        written(join(home, 'clip.mp4'));
        const at = onSocket(yield* requestFile(home, 'clip.mp4'));
        const etag = (yield* ask(at)).headers.etag as string;
        const open = () => readdirSync('/dev/fd').length;
        const before = open();
        for (let each = 0; each < 20; each++) {
          yield* ask(at, { 'if-none-match': etag });
          yield* ask(at, {}, 'HEAD');
          yield* ask(at, { range: 'bytes=99-' });
        }
        expect(open() - before).toBeLessThan(10);
      }),
    ));

  it('gives each version of a file its own ETag', () => {
    const stats = { dev: 1, ino: 2, size: 3, mtimeMs: 1_700_000_000_000.5 };
    const version = versionOf(stats);
    expect(version.lastModified).toBe(new Date(stats.mtimeMs).toUTCString());
    for (const changed of [
      { dev: 9 },
      { ino: 9 },
      { size: 9 },
      { mtimeMs: stats.mtimeMs + 0.001 },
    ])
      expect(versionOf({ ...stats, ...changed }).etag).not.toBe(version.etag);
    expect(matches(undefined, version.etag)).toBe(false);
    expect(matches('"a", "b"', version.etag)).toBe(false);
    expect(matches(` W/${version.etag} `, version.etag)).toBe(true);
  });

  it('serves an empty file whole', () =>
    withPlugin(({ home, requestFile, ask }) =>
      Effect.gen(function* () {
        written(join(home, 'empty.md'), '');
        const at = onSocket(yield* requestFile(home, 'empty.md'));
        const answer = yield* ask(at);
        expect(answer).toMatchObject({ status: 200, body: '' });
        expect(answer.headers['content-length']).toBe('0');
        expect((yield* ask(at, { range: 'bytes=0-' })).status).toBe(416);
      }),
    ));
});

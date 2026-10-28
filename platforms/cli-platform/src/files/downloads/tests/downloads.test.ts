import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Downloads } from '../downloads.js';

/* Downloads against a local HTTP server that counts what it is asked for. */

const content = Buffer.from('a Plugin, one file\n'.repeat(4096));
const sha256 = createHash('sha256').update(content).digest('hex');

let base = '';
const requests: Array<string> = [];
const server = createServer((request, response) => {
  requests.push(request.url ?? '');
  const body = request.url === '/wrong' ? Buffer.from('not it') : content;
  response.writeHead(200, { 'content-length': body.length });
  // Slowly, in two halves, so a second fetch arrives while the first runs.
  response.write(body.subarray(0, body.length / 2));
  setTimeout(() => response.end(body.subarray(body.length / 2)), 100);
});

beforeAll(
  () =>
    new Promise<void>((done) =>
      server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        done();
      }),
    ),
);
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const withCache = <A, E>(
  use: (downloads: Downloads['Service'], cache: string) => Effect.Effect<A, E>,
) => {
  const cache = mkdtempSync(join(tmpdir(), 'cli-platform-downloads-'));
  return Effect.runPromise(
    Effect.flatMap(Downloads, (downloads) => use(downloads, cache)).pipe(
      Effect.provide(Downloads.layer(cache)),
    ),
  );
};

describe('Downloads', () => {
  it('downloads a file once, checks it, and serves it from the cache after', () =>
    withCache((downloads, cache) =>
      Effect.gen(function* () {
        requests.length = 0;
        const progress: Array<number> = [];
        const file = yield* downloads.fetch(
          { url: `${base}/plugin`, sha256, name: 'plugin.mjs' },
          ({ received, total }) =>
            Effect.sync(() => {
              expect(total).toBe(content.length);
              progress.push(received);
            }),
        );
        expect(file).toBe(join(cache, 'downloads', sha256, 'plugin.mjs'));
        expect(readFileSync(file)).toEqual(content);
        expect(progress.at(-1)).toBe(content.length);
        const again = yield* downloads.fetch({
          url: `${base}/plugin`,
          sha256,
          name: 'plugin.mjs',
        });
        expect(again).toBe(file);
        expect(requests).toEqual(['/plugin']);
      }),
    ));

  it('refuses a file whose hash is not the one asked for, and leaves nothing behind', () =>
    withCache((downloads, cache) =>
      Effect.gen(function* () {
        const failed = yield* Effect.flip(
          downloads.fetch({ url: `${base}/wrong`, sha256 }),
        );
        expect(failed).toMatchObject({
          _tag: 'HashMismatch',
          expected: sha256,
        });
        expect(readdirSync(join(cache, 'downloads'))).toEqual([]);
      }),
    ));

  it('copies a file: URL into the cache, checked like a download', () =>
    withCache((downloads, cache) =>
      Effect.gen(function* () {
        const shelf = mkdtempSync(join(tmpdir(), 'cli-platform-shelf-'));
        const at = join(shelf, `${sha256}.mjs`);
        writeFileSync(at, content);
        const url = pathToFileURL(at).href;
        const progress: Array<number> = [];
        const file = yield* downloads.fetch(
          { url, sha256, name: 'plugin.mjs' },
          ({ received }) => Effect.sync(() => void progress.push(received)),
        );
        expect(file).toBe(join(cache, 'downloads', sha256, 'plugin.mjs'));
        expect(readFileSync(file)).toEqual(content);
        expect(progress.at(-1)).toBe(content.length);

        const wrong = join(shelf, 'wrong.mjs');
        writeFileSync(wrong, 'not it');
        const other = 'b'.repeat(64);
        expect(
          yield* Effect.flip(
            downloads.fetch({ url: pathToFileURL(wrong).href, sha256: other }),
          ),
        ).toMatchObject({ _tag: 'HashMismatch', expected: other });

        const gone = pathToFileURL(join(shelf, 'gone.mjs')).href;
        expect(
          yield* Effect.flip(downloads.fetch({ url: gone, sha256: other })),
        ).toMatchObject({ _tag: 'DownloadFailed', url: gone, missing: true });
        expect(readdirSync(join(cache, 'downloads'))).toEqual([sha256]);
      }),
    ));

  it('makes one HTTP request for two fetches of one entry at once', () =>
    withCache((downloads) =>
      Effect.gen(function* () {
        requests.length = 0;
        const fetchIt = downloads.fetch({ url: `${base}/both`, sha256 });
        const [a, b] = yield* Effect.all([fetchIt, fetchIt], {
          concurrency: 'unbounded',
        });
        expect(a).toBe(b);
        expect(requests).toEqual(['/both']);
      }),
    ));

  it('makes a file with no hash known up front once, by its key', () =>
    withCache((downloads, cache) =>
      Effect.gen(function* () {
        let made = 0;
        const ensureIt = downloads.ensure({
          key: 'cloudflared-2026.1.0',
          name: 'cloudflared',
          produce: (file) =>
            Effect.sync(() => {
              made++;
              return file;
            }).pipe(
              Effect.flatMap((file) =>
                Effect.promise(() =>
                  import('node:fs/promises').then((fs) =>
                    fs.writeFile(file, 'binary'),
                  ),
                ),
              ),
            ),
        });
        const file = yield* ensureIt;
        yield* ensureIt;
        expect(made).toBe(1);
        expect(file).toBe(
          join(cache, 'downloads', 'cloudflared-2026.1.0', 'cloudflared'),
        );
        expect(readFileSync(file, 'utf8')).toBe('binary');
      }),
    ));

  it('prunes entries unused for a while, but keeps those in keep and the recent', () =>
    withCache((downloads, cache) =>
      Effect.gen(function* () {
        const make = (key: string) =>
          downloads.ensure({
            key,
            produce: (file) =>
              Effect.promise(() =>
                import('node:fs/promises').then((fs) =>
                  fs.writeFile(file, key),
                ),
              ),
          });
        for (const key of ['old', 'kept', 'recent']) yield* make(key);
        const longAgo = new Date(Date.now() - 10 * 24 * 3600_000);
        for (const key of ['old', 'kept'])
          utimesSync(join(cache, 'downloads', key, 'used'), longAgo, longAgo);
        const removed = yield* downloads.prune({
          olderThan: '7 days',
          keep: ['kept'],
        });
        expect(removed).toEqual(['old']);
        expect(existsSync(join(cache, 'downloads', 'old'))).toBe(false);
        expect(existsSync(join(cache, 'downloads', 'kept'))).toBe(true);
        expect(existsSync(join(cache, 'downloads', 'recent'))).toBe(true);
      }),
    ));

  it('keeps an entry marked used again, as a running Plugin marks its file', () =>
    withCache((downloads, cache) =>
      Effect.gen(function* () {
        yield* downloads.ensure({
          key: 'running',
          produce: (file) =>
            Effect.promise(() =>
              import('node:fs/promises').then((fs) =>
                fs.writeFile(file, 'plugin'),
              ),
            ),
        });
        const longAgo = new Date(Date.now() - 40 * 24 * 3600_000);
        utimesSync(
          join(cache, 'downloads', 'running', 'used'),
          longAgo,
          longAgo,
        );
        yield* downloads.use('running');
        yield* downloads.use('missing');
        expect(yield* downloads.prune({ olderThan: '30 days' })).toEqual([]);
        expect(existsSync(join(cache, 'downloads', 'running'))).toBe(true);
        expect(existsSync(join(cache, 'downloads', 'missing'))).toBe(false);
      }),
    ));
});

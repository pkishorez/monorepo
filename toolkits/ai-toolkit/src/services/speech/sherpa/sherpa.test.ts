import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context, Effect, Layer } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { SpeechToText, type Fetched } from '../contract/index.js';
import { sherpa } from './index.js';

/*
 * The Parakeet model's install against small files and a small tarball of
 * the same shape, served from this process, the tarball with Range support; and one real transcription,
 * run only when the model is already on disk: in AI_TOOLKIT_SPEECH_MODEL,
 * or where `ai-toolkit serve` keeps it.
 */

const FILES = [
  'encoder.int8.onnx',
  'decoder.int8.onnx',
  'joiner.int8.onnx',
  'tokens.txt',
];
const TOP = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';

const folders: Array<string> = [];
const servers: Array<Server> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
  for (const server of servers.splice(0)) server.close();
});
const folder = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-sherpa-'));
  folders.push(made);
  return made;
};

/** A tarball like the release's: one top folder holding the model's files. */
const tarball = () => {
  const source = folder();
  mkdirSync(join(source, TOP));
  for (const file of FILES)
    writeFileSync(join(source, TOP, file), `${file} `.repeat(20_000));
  const made = join(folder(), 'model.tar.bz2');
  execFileSync('tar', ['-cjf', made, '-C', source, TOP]);
  return readFileSync(made);
};

/** Serves `bytes` at a URL, a Range answered with the rest; the Ranges asked for. */
const serve = (bytes: Buffer) =>
  Effect.promise(
    () =>
      new Promise<{ url: string; ranges: Array<string | undefined> }>(
        (resolve) => {
          const ranges: Array<string | undefined> = [];
          const server = createServer((request, response) => {
            const range = request.headers.range;
            ranges.push(range);
            const from = Number(/^bytes=(\d+)-$/.exec(range ?? '')?.[1] ?? 0);
            if (from >= bytes.length) return void response.writeHead(416).end();
            response.writeHead(range ? 206 : 200, {
              'content-length': bytes.length - from,
            });
            response.end(bytes.subarray(from));
          });
          servers.push(server);
          server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port =
              typeof address === 'object' && address !== null
                ? address.port
                : 0;
            resolve({ url: `http://127.0.0.1:${port}/model.tar.bz2`, ranges });
          });
        },
      ),
  );

/** Serves each of `files` at its own path, HEAD saying its size; anything else is 404. */
const serveFiles = (files: Record<string, Buffer>) =>
  Effect.promise(
    () =>
      new Promise<{ base: string; asked: Array<string> }>((resolve) => {
        const asked: Array<string> = [];
        const server = createServer((request, response) => {
          const bytes = files[(request.url ?? '').slice(1)];
          if (bytes === undefined) return void response.writeHead(404).end();
          response.writeHead(200, { 'content-length': bytes.length });
          if (request.method === 'HEAD') return void response.end();
          asked.push((request.url ?? '').slice(1));
          response.end(bytes);
        });
        servers.push(server);
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port =
            typeof address === 'object' && address !== null ? address.port : 0;
          resolve({ base: `http://127.0.0.1:${port}/`, asked });
        });
      }),
  );

const speechFrom = (options: Parameters<typeof sherpa>[0]) =>
  Effect.map(Layer.build(sherpa(options)), (context) =>
    Context.get(context, SpeechToText),
  );

const speechAt = (url: string) => speechFrom({ files: null, tarball: url });

const record = () => {
  const seen: Array<Fetched> = [];
  return {
    seen,
    progress: (fetched: Fetched) => Effect.sync(() => void seen.push(fetched)),
  };
};

describe('Parakeet with sherpa-onnx', () => {
  it('downloads the tarball, unpacks its files into the folder and deletes it', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bytes = tarball();
          const { url, ranges } = yield* serve(bytes);
          const speech = yield* speechAt(url);
          const model = join(folder(), 'model');
          expect(yield* speech.installed(model)).toBe(false);
          const { seen, progress } = record();
          yield* speech.install(model, progress);
          expect(yield* speech.installed(model)).toBe(true);
          for (const file of FILES)
            expect(existsSync(join(model, file))).toBe(true);
          expect(existsSync(join(model, 'model.tar.bz2'))).toBe(false);
          expect(seen[0]).toEqual({ done: 0, total: bytes.length });
          expect(seen.at(-1)).toEqual({
            done: bytes.length,
            total: bytes.length,
          });
          expect(ranges).toEqual([undefined]);
        }),
      ),
    ));

  it('carries on from a download cut off, asking only for the rest', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bytes = tarball();
          const half = Math.floor(bytes.length / 2);
          const { url, ranges } = yield* serve(bytes);
          const speech = yield* speechAt(url);
          const model = join(folder(), 'model');
          mkdirSync(model);
          writeFileSync(join(model, 'model.tar.bz2'), bytes.subarray(0, half));
          const { seen, progress } = record();
          yield* speech.install(model, progress);
          expect(yield* speech.installed(model)).toBe(true);
          expect(ranges).toEqual([`bytes=${half}-`]);
          expect(seen[0]).toEqual({ done: half, total: bytes.length });
        }),
      ),
    ));

  it('fails on a tarball that does not unpack, and deletes it so the next try starts over', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { url } = yield* serve(Buffer.from('not a tarball'));
          const speech = yield* speechAt(url);
          const model = join(folder(), 'model');
          const failure = yield* Effect.flip(
            speech.install(model, () => Effect.void),
          );
          expect(failure.message).toMatch(/did not unpack/);
          expect(existsSync(join(model, 'model.tar.bz2'))).toBe(false);
        }),
      ),
    ));

  it('fetches the files one by one, each named only once whole, with progress over all of them', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const files = Object.fromEntries(
            FILES.map((file) => [file, Buffer.from(`${file} `.repeat(5_000))]),
          );
          const total = Object.values(files).reduce(
            (all, bytes) => all + bytes.length,
            0,
          );
          const { base, asked } = yield* serveFiles(files);
          const speech = yield* speechFrom({ files: base, tarball: 'unused' });
          const model = join(folder(), 'model');
          const { seen, progress } = record();
          yield* speech.install(model, progress);
          expect(yield* speech.installed(model)).toBe(true);
          expect(asked).toEqual(FILES);
          for (const file of FILES) {
            expect(readFileSync(join(model, file))).toEqual(files[file]);
            expect(existsSync(join(model, `${file}.part`))).toBe(false);
          }
          expect(seen.at(-1)).toEqual({ done: total, total });
        }),
      ),
    ));

  it('falls back to the tarball when the files cannot be fetched', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { base } = yield* serveFiles({});
          const { url } = yield* serve(tarball());
          const speech = yield* speechFrom({ files: base, tarball: url });
          const model = join(folder(), 'model');
          yield* speech.install(model, () => Effect.void);
          expect(yield* speech.installed(model)).toBe(true);
        }),
      ),
    ));

  const real =
    process.env['AI_TOOLKIT_SPEECH_MODEL'] ??
    join(homedir(), '.ai-toolkit', 'speech-to-text', 'model');
  const wave = join(real, 'test_wavs', '0.wav');
  it.skipIf(!existsSync(join(real, 'tokens.txt')) || !existsSync(wave))(
    'transcribes a recording with the model on disk',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const speech = yield* speechAt('http://127.0.0.1:9/unused');
            expect(yield* speech.installed(real)).toBe(true);
            const recognizer = yield* speech.load(real);
            // 16 kHz mono 16-bit PCM after a 44-byte header.
            const pcm = readFileSync(wave).subarray(44);
            const samples = new Float32Array(pcm.length / 2);
            for (let at = 0; at < samples.length; at++)
              samples[at] = pcm.readInt16LE(at * 2) / 32768;
            const text = yield* recognizer.transcribe(samples);
            expect(text.toLowerCase()).toContain('the old portrait');
          }),
        ),
      ),
    60_000,
  );
});

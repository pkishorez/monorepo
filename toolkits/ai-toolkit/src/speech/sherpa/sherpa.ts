import { execFile } from 'node:child_process';
import { access, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import {
  SpeechToText,
  SpeechToTextError,
  type Fetched,
} from '../contract/index.js';
import { download } from './download.js';
import { loadRecognizer, MODEL_FILES } from './recognizer.js';

/*
 * Speech to Text with sherpa-onnx and NVIDIA's Parakeet TDT 0.6b v2, int8
 * (ADR 0017), English, with punctuation and capitals. Its files come
 * first from the copy sherpa-onnx's author keeps on Hugging Face, pinned to
 * one revision, about 660 MB unpacked: each file is fetched into
 * `<file>.part` and named only once whole, so a file is there only when it
 * is complete, and a restart carries on the part. Hugging Face serves them
 * several times faster than GitHub. When that fails, the model is the
 * tarball of sherpa-onnx's `asr-models` GitHub release, about 480 MB,
 * downloaded into the folder and unpacked there by the system's `tar`,
 * which reads bzip2 on macOS, Linux and Windows 10 on; the tarball is
 * deleted once unpacked. A tarball that does not unpack is deleted too, so
 * the next install fetches it afresh.
 */

/** The model's files, one by one, at a pinned revision. */
export const PARAKEET_FILES =
  'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/1ab9323565ddb038682214b292f588070a538ce2/';

/** The same model as one tarball: the fallback. */
export const PARAKEET_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2';

const TARBALL = 'model.tar.bz2';

const exists = (path: string) =>
  Effect.promise(() =>
    access(path).then(
      () => true,
      () => false,
    ),
  );

/** Unpacks the tarball's one top folder into `folder`; why it failed, or null. */
const unpack = (tarball: string, folder: string) =>
  Effect.callback<string | null>((resume) => {
    const child = execFile(
      'tar',
      ['-xjf', tarball, '-C', folder, '--strip-components=1'],
      (error, _stdout, stderr) =>
        resume(
          Effect.succeed(
            error === null ? null : stderr.trim() || error.message,
          ),
        ),
    );
    return Effect.sync(() => void child.kill());
  });

const installed = (folder: string) =>
  Effect.gen(function* () {
    if (yield* exists(join(folder, TARBALL))) return false;
    for (const file of MODEL_FILES)
      if (!(yield* exists(join(folder, file)))) return false;
    return true;
  });

/** The size `url` says it has, or 0 when it does not say. */
const sizeAt = (url: string) =>
  Effect.promise(() =>
    fetch(url, { method: 'HEAD' }).then(
      (response) =>
        response.ok ? Number(response.headers.get('content-length')) || 0 : 0,
      () => 0,
    ),
  );

const sizeOf = (path: string) =>
  Effect.promise(() =>
    stat(path).then(
      (found) => found.size,
      () => 0,
    ),
  );

/**
 * Each of the model's files from `base` into `folder`, skipping those
 * already whole. The progress is over all of them: their sizes as the
 * server says, so a file that does not say adds nothing to the total.
 */
const fromFiles = (
  base: string,
  folder: string,
  progress: (fetched: Fetched) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const sizes = yield* Effect.forEach(
      MODEL_FILES,
      (file) => sizeAt(`${base}${file}`),
      { concurrency: 'unbounded' },
    );
    const sum = sizes.reduce((all, size) => all + size, 0);
    const total = sum > 0 ? sum : null;
    let before = 0;
    for (const file of MODEL_FILES) {
      const whole = join(folder, file);
      if (!(yield* exists(whole))) {
        const part = `${whole}.part`;
        yield* download(`${base}${file}`, part, ({ done }) =>
          progress({
            done:
              total === null ? before + done : Math.min(before + done, total),
            total,
          }),
        );
        yield* Effect.tryPromise({
          try: () => rename(part, whole),
          catch: (cause) =>
            new SpeechToTextError({ message: `Could not keep ${file}`, cause }),
        });
      }
      before += yield* sizeOf(whole);
    }
  });

/** The release's tarball from `url` into `folder`, unpacked there. */
const fromTarball = (
  url: string,
  folder: string,
  progress: (fetched: Fetched) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const tarball = join(folder, TARBALL);
    yield* download(url, tarball, progress);
    const why = yield* unpack(tarball, folder);
    yield* Effect.promise(() => rm(tarball, { force: true }));
    if (why !== null)
      return yield* new SpeechToTextError({
        message: `The model did not unpack: ${why}`,
      });
  });

/**
 * Parakeet from the files at `files`, else the tarball at `tarball`: by
 * default Hugging Face, then GitHub. `files: null` goes to the tarball
 * alone.
 */
export const sherpa = (options?: {
  readonly files?: string | null;
  readonly tarball?: string;
}) => {
  const files = options?.files === undefined ? PARAKEET_FILES : options.files;
  const tarball = options?.tarball ?? PARAKEET_URL;
  return Layer.succeed(SpeechToText, {
    installed,
    install: (folder, progress) =>
      Effect.gen(function* () {
        if (yield* installed(folder)) return;
        yield* Effect.tryPromise({
          try: () => mkdir(folder, { recursive: true }),
          catch: (cause) =>
            new SpeechToTextError({
              message: `Could not make ${folder}`,
              cause,
            }),
        });
        yield* files === null
          ? fromTarball(tarball, folder, progress)
          : fromFiles(files, folder, progress).pipe(
              Effect.catch(() =>
                Effect.gen(function* () {
                  for (const file of MODEL_FILES)
                    yield* Effect.promise(() =>
                      rm(join(folder, `${file}.part`), { force: true }),
                    );
                  yield* fromTarball(tarball, folder, progress);
                }),
              ),
            );
        if (!(yield* installed(folder)))
          return yield* new SpeechToTextError({
            message: `The model was fetched without ${MODEL_FILES.join(', ')}`,
          });
      }),
    load: loadRecognizer,
  });
};

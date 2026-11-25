import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { Effect } from 'effect';
import { Failed } from './process.ts';

const failed = (message: string) => (cause: unknown) =>
  new Failed({
    message: `${message}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

/** Writes `path` whole or not at all: into `<path>.part`, then renamed. */
export const write = (path: string, content: string | Uint8Array) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.part`, content);
      await rename(`${path}.part`, path);
    },
    catch: failed(`Could not write ${path}`),
  });

/** Writes `value` as JSON, whole or not at all. */
export const writeJson = (path: string, value: unknown) =>
  write(path, `${JSON.stringify(value, null, 2)}\n`);

/** The text of `path`. */
export const readText = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, 'utf8'),
    catch: failed(`Could not read ${path}`),
  });

/** The bytes of `path`. */
export const readBytes = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path),
    catch: failed(`Could not read ${path}`),
  });

/** The JSON in `path`, as written by an earlier step. */
export const readJson = (path: string) =>
  readText(path).pipe(
    Effect.flatMap((text) =>
      Effect.try({
        try: () => JSON.parse(text) as unknown,
        catch: failed(`${path} is not whole JSON`),
      }),
    ),
  );

/** Whether `path` is there. */
export const exists = (path: string) =>
  Effect.promise(() =>
    access(path).then(
      () => true,
      () => false,
    ),
  );

/** Makes the folder `path` and its parents. */
export const folder = (path: string) =>
  Effect.tryPromise({
    try: () => mkdir(path, { recursive: true }),
    catch: failed(`Could not make ${path}`),
  }).pipe(Effect.asVoid);

/** Renames `from` to `to`. */
export const move = (from: string, to: string) =>
  Effect.tryPromise({
    try: () => rename(from, to),
    catch: failed(`Could not rename ${from}`),
  });

/** Removes `path` and anything in it. */
export const remove = (path: string) =>
  Effect.promise(() => rm(path, { recursive: true, force: true }));

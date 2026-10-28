import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Effect, Schema } from 'effect';
import type { PluginVersion } from '../../cloud/contract/index.js';

/*
 * The Release of each Plugin the Connection last wanted, kept as
 * `wanted.json` in its data folder, so a Connection started again while
 * Cloud Connect cannot be reached runs its Plugins at their last Release.
 * The root writes it each time what it wants changes; the next start reads
 * it as Input. Only Releases are kept, never a file given in development.
 * A file that cannot be read is no Plugins, with a warning.
 */

const Remembered = Schema.Struct({
  wanted: Schema.Record(
    Schema.String,
    Schema.Struct({ hash: Schema.String, url: Schema.String }),
  ),
});

const Json = Schema.fromJsonString(Remembered);

/** Where the Connection with the data folder `data` keeps what it last wanted. */
export const rememberedFile = (data: string) => join(data, 'wanted.json');

/** What the Connection with the data folder `data` last wanted; none when it kept nothing. */
export const remembered = (data: string) =>
  Effect.gen(function* () {
    const file = rememberedFile(data);
    if (!existsSync(file)) return {};
    return yield* Effect.try(() => readFileSync(file, 'utf8')).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Json)),
      Effect.map(({ wanted }) => wanted),
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning(`Could not read ${file}; it is ignored`, error),
          {},
        ),
      ),
    );
  });

/** Keeps `wanted` as what the Connection with the data folder `data` last wanted, replacing it whole; a failure is only logged. */
export const remember = (
  data: string,
  wanted: Readonly<Record<string, PluginVersion>>,
) => {
  const file = rememberedFile(data);
  return Effect.try(() => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${Schema.encodeSync(Json)({ wanted })}\n`);
    renameSync(temporary, file);
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(`Could not write ${file}`, error),
    ),
  );
};

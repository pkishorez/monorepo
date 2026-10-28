import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Effect, Schema } from 'effect';
import type { AuthInfo } from '../../../cloud/contract/index.js';

/*
 * How Cloud Connect last said to sign in, kept as `auth.json` beside the
 * database file that keeps the Sign-in, with the Cloud Connect that said
 * it. A Connection started while Cloud Connect cannot be asked signs in
 * the same way, with the Sign-in it kept. A file that cannot be read is
 * none, with a warning.
 */

const Kept = Schema.Struct({ cloud: Schema.String, url: Schema.String });

const Json = Schema.fromJsonString(Kept);

/** Where the AuthInfo is kept, beside the database file `db`. */
const fileOf = (db: string) => join(dirname(db), 'auth.json');

/** The AuthInfo `cloud` last gave, kept beside `db`; null when none was. */
export const keptAuthInfo = (db: string, cloud: string) =>
  Effect.gen(function* () {
    const file = fileOf(db);
    if (!existsSync(file)) return null;
    return yield* Effect.try(() => readFileSync(file, 'utf8')).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Json)),
      Effect.map((kept): AuthInfo | null =>
        kept.cloud === cloud ? { url: kept.url } : null,
      ),
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning(`Could not read ${file}; it is ignored`, error),
          null,
        ),
      ),
    );
  });

/** Keeps `info` as the AuthInfo `cloud` gave, beside `db`, replacing it whole; a failure is only logged. */
export const keepAuthInfo = (db: string, cloud: string, info: AuthInfo) => {
  const file = fileOf(db);
  return Effect.try(() => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      `${Schema.encodeSync(Json)({ cloud, url: info.url })}\n`,
      { mode: 0o600 },
    );
    renameSync(temporary, file);
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(`Could not write ${file}`, error),
    ),
  );
};

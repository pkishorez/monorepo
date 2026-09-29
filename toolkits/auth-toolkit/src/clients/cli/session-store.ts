import { Effect, FileSystem, Path, Schema } from 'effect';
import { homedir } from 'node:os';

const Sessions = Schema.Record(Schema.String, Schema.String);

export const makeSessionStore = (app: string, authWorkerUrl: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(
      process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'),
      app,
      'auth.json',
    );

    const readAll: Effect.Effect<Record<string, string>> = fs
      .readFileString(file)
      .pipe(
        Effect.flatMap((text) => Effect.try(() => JSON.parse(text))),
        Effect.flatMap(Schema.decodeUnknownEffect(Sessions)),
        Effect.orElseSucceed(() => ({})),
      );

    const writeAll = (sessions: Record<string, string>) =>
      Object.keys(sessions).length === 0
        ? fs.remove(file, { force: true })
        : fs
            .makeDirectory(path.dirname(file), { recursive: true })
            .pipe(
              Effect.andThen(
                fs.writeFileString(
                  file,
                  `${JSON.stringify(sessions, null, 2)}\n`,
                ),
              ),
              Effect.andThen(fs.chmod(file, 0o600)),
            );

    return {
      read: Effect.map(
        readAll,
        (sessions): string | undefined => sessions[authWorkerUrl],
      ),
      write: (token: string) =>
        readAll.pipe(
          Effect.flatMap((sessions) =>
            writeAll({ ...sessions, [authWorkerUrl]: token }),
          ),
          Effect.orDie,
        ),
      clear: readAll.pipe(
        Effect.flatMap((sessions) =>
          writeAll(
            Object.fromEntries(
              Object.entries(sessions).filter(([url]) => url !== authWorkerUrl),
            ),
          ),
        ),
        Effect.orDie,
      ),
    };
  });

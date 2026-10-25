import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Effect } from 'effect';

/*
 * Before Connect, ai-toolkit kept everything in ~/.ai-toolkit. The first
 * production run moves what is still read there into Connect's folders,
 * once: it runs only while the old database is there and the new one is
 * not. dev.db, dev-local.db and preview.db were for development and are
 * left alone.
 */

/** Where each old file goes. */
interface Targets {
  readonly db: string;
  readonly attachments: string;
  readonly models: string;
  readonly speech: string;
  readonly cloudflared: string;
}

/** Moves `from` to `to`, copying then deleting when they are on different disks. */
const move = (from: string, to: string) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => {
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
      try {
        renameSync(from, to);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        cpSync(from, to, { recursive: true });
        rmSync(from, { recursive: true, force: true });
      }
    });
    yield* Effect.log(`Moved ${from} to ${to}`);
  });

/** Moves `from` if it is there. */
const moveIfThere = (from: string, to: string) =>
  Effect.suspend(() => (existsSync(from) ? move(from, to) : Effect.void));

/** Whether there is anything to move. */
export const needsMove = (legacy: string, db: string) =>
  existsSync(join(legacy, 'ai.db')) && !existsSync(db);

/** Moves the old files out of `legacy`, then leaves a note saying where. */
export const moveFrom = (legacy: string, targets: Targets) =>
  Effect.gen(function* () {
    const at = (name: string) => join(legacy, name);
    yield* move(at('ai.db'), targets.db);
    yield* moveIfThere(at('ai.db-wal'), `${targets.db}-wal`);
    yield* moveIfThere(at('ai.db-shm'), `${targets.db}-shm`);

    if (existsSync(at('attachments'))) {
      yield* move(at('attachments'), targets.attachments);
      // Old Raw records name their attachments by absolute path.
      yield* Effect.sync(() =>
        symlinkSync(targets.attachments, at('attachments'), 'junction'),
      );
      yield* Effect.log(
        `Linked ${at('attachments')} to ${targets.attachments}`,
      );
    }

    yield* moveIfThere(at('models.json'), targets.models);
    yield* moveIfThere(at('speech-to-text'), targets.speech);
    yield* moveIfThere(
      at(
        join(
          'bin',
          process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
        ),
      ),
      targets.cloudflared,
    );

    yield* Effect.sync(() =>
      writeFileSync(
        at('MOVED.txt'),
        [
          'ke-connect moved these files on its first run:',
          '',
          `database      ${targets.db}`,
          `attachments   ${targets.attachments}`,
          `models        ${targets.models}`,
          `speech        ${targets.speech}`,
          `cloudflared   ${targets.cloudflared}`,
          '',
        ].join('\n'),
      ),
    );
    yield* Effect.log(`Wrote ${at('MOVED.txt')}`);
  });

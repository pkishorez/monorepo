import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Effect } from 'effect';

/*
 * Before Connect, ai-toolkit kept everything in ~/.ai-toolkit. The first
 * production run moves what is still read there into Connect's folders,
 * once: it runs while the old database is there and the new one is not,
 * or while its `MOVING` note says a move was cut short, which it then
 * finishes. Each step moves only what is still there, the database last of
 * its files, so its WAL never stays behind once `connect.db` exists.
 * dev.db, dev-local.db and preview.db were for development and are left
 * alone.
 */

/** Where each old file goes. */
interface Targets {
  readonly db: string;
  readonly attachments: string;
  readonly models: string;
  readonly speech: string;
  readonly cloudflared: string;
}

const MOVING = 'MOVING';

/**
 * Moves `from` to `to`, copying then deleting when they are on different
 * disks: copied under a temporary name first, so `to` appears whole.
 */
const move = (from: string, to: string) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => {
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
      try {
        renameSync(from, to);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        const temp = `${to}.moving`;
        rmSync(temp, { recursive: true, force: true });
        cpSync(from, temp, { recursive: true });
        renameSync(temp, to);
        rmSync(from, { recursive: true, force: true });
      }
    });
    yield* Effect.log(`Moved ${from} to ${to}`);
  });

/** Moves `from` if it is there. */
const moveIfThere = (from: string, to: string) =>
  Effect.suspend(() => (existsSync(from) ? move(from, to) : Effect.void));

/** Whether anything is at `path`, a dangling link included. */
const lexists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** Whether there is anything to move, or a move to finish. */
export const needsMove = (legacy: string, db: string) =>
  existsSync(join(legacy, MOVING)) ||
  (existsSync(join(legacy, 'ai.db')) && !existsSync(db));

/** Moves the old files out of `legacy`, then leaves a note saying where. */
export const moveFrom = (legacy: string, targets: Targets) =>
  Effect.gen(function* () {
    const at = (name: string) => join(legacy, name);
    yield* Effect.sync(() => writeFileSync(at(MOVING), ''));
    // Never over a database already moved, should an old ai-toolkit have
    // made another since.
    if (!existsSync(targets.db)) {
      yield* moveIfThere(at('ai.db-wal'), `${targets.db}-wal`);
      yield* moveIfThere(at('ai.db-shm'), `${targets.db}-shm`);
      yield* moveIfThere(at('ai.db'), targets.db);
    }

    if (
      existsSync(at('attachments')) &&
      !lstatSync(at('attachments')).isSymbolicLink()
    )
      yield* move(at('attachments'), targets.attachments);
    if (!lexists(at('attachments')) && existsSync(targets.attachments)) {
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
    yield* Effect.sync(() => unlinkSync(at(MOVING)));
  });

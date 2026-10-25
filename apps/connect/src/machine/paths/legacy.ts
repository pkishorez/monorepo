import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
 * A file moved across disks is copied, then put in place whole, then
 * noted in `MOVING` as put in place, then deleted; a move cut short after
 * the note finds both, and only deletes the old one. Finding both without
 * the note, the one in Connect's folder is not this move's: neither is
 * touched, and the move fails, naming both, until one is moved away.
 * The database and attachments must move; models, speech and cloudflared
 * need not: one already in Connect's folder (a speech model downloaded in
 * development, say) is kept and the old one left, and one that fails to
 * move is logged and left, so neither keeps the move from finishing.
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
 * The `MOVING` note: the old files whose copy is in place, so deleting
 * them is all that is left. Each is noted before it is deleted.
 */
interface Moving {
  readonly placed: ReadonlySet<string>;
  readonly place: (from: string) => void;
}

/** Writes `text` to `path` whole: to a temporary file, then renamed. */
const writeWhole = (path: string, text: string) => {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
};

/** Reads the note at `path`, making it if it is not there. */
const noteAt = (path: string): Moving => {
  let listed: unknown = [];
  try {
    listed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // Not there, or empty: nothing is in place yet.
  }
  const placed = new Set(
    Array.isArray(listed)
      ? listed.filter((from): from is string => typeof from === 'string')
      : [],
  );
  writeWhole(path, JSON.stringify([...placed]));
  return {
    placed,
    place: (from) => {
      placed.add(from);
      writeWhole(path, JSON.stringify([...placed]));
    },
  };
};

/** Whether anything is at `path`, a dangling link included. */
const lexists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Moves `from` to `to`, copying then deleting when they are on different
 * disks: copied under a temporary name first, so `to` appears whole, and
 * noted in `moving`, when given, before `from` is deleted.
 */
const move = (from: string, to: string, moving?: Moving) =>
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
        moving?.place(from);
        rmSync(from, { recursive: true, force: true });
      }
    });
    yield* Effect.log(`Moved ${from} to ${to}`);
  });

/** Whether `path` is there and is a file, or a folder with something in it. */
const filled = (path: string) => {
  try {
    return !lstatSync(path).isDirectory() || readdirSync(path).length > 0;
  } catch {
    return false;
  }
};

/**
 * Moves `from`, which Connect needs, in place of an empty `to`. A filled
 * `to` while `from` is still there was put in place by a move cut short
 * when the note says so, and only deleting `from` was left: that is done
 * instead of moving it again. Otherwise `to` is not this move's, and the
 * move fails with both left as they are.
 */
const moveStrict = (from: string, to: string, moving: Moving) =>
  Effect.suspend(() => {
    if (!filled(to))
      return Effect.sync(() =>
        rmSync(to, { recursive: true, force: true }),
      ).pipe(Effect.andThen(move(from, to, moving)));
    if (!moving.placed.has(from))
      return Effect.die(
        new Error(
          `Cannot move ${from} to ${to}: both are there, and ${to} was not put there by this move. Move one of them away, then start again.`,
        ),
      );
    return Effect.sync(() => {
      rmSync(`${to}.moving`, { recursive: true, force: true });
      rmSync(from, { recursive: true, force: true });
    }).pipe(Effect.andThen(Effect.log(`Moved ${from} to ${to}, finished`)));
  });

/** Moves `from`, which Connect needs, if it is there. */
const moveIfThere = (from: string, to: string, moving: Moving) =>
  Effect.suspend(() =>
    existsSync(from) ? moveStrict(from, to, moving) : Effect.void,
  );

/**
 * Moves `from`, which Connect can do without, if it is there: left where
 * it is when `to` is already filled, or when it fails to move.
 */
const moveSpare = (from: string, to: string) =>
  Effect.suspend(() => {
    if (!existsSync(from)) return Effect.void;
    if (filled(to))
      return Effect.logWarning(
        `Left ${from}: ${to} is already there, and is kept`,
      );
    return move(from, to).pipe(
      Effect.catchDefect((error) =>
        Effect.logWarning(`Left ${from}: moving it to ${to} failed`, error),
      ),
    );
  });

/** Whether there is anything to move, or a move to finish. */
export const needsMove = (legacy: string, db: string) =>
  existsSync(join(legacy, MOVING)) ||
  (existsSync(join(legacy, 'ai.db')) && !existsSync(db));

/** Moves the old files out of `legacy`, then leaves a note saying where. */
export const moveFrom = (legacy: string, targets: Targets) =>
  Effect.gen(function* () {
    const at = (name: string) => join(legacy, name);
    const moving = yield* Effect.sync(() => noteAt(at(MOVING)));
    // Never over a database already moved, should an old ai-toolkit have
    // made another since.
    if (!existsSync(targets.db)) {
      yield* moveIfThere(at('ai.db-wal'), `${targets.db}-wal`, moving);
      yield* moveIfThere(at('ai.db-shm'), `${targets.db}-shm`, moving);
      yield* moveIfThere(at('ai.db'), targets.db, moving);
    }

    if (
      existsSync(at('attachments')) &&
      !lstatSync(at('attachments')).isSymbolicLink()
    )
      yield* moveStrict(at('attachments'), targets.attachments, moving);
    if (!lexists(at('attachments')) && existsSync(targets.attachments)) {
      // Old Raw records name their attachments by absolute path.
      yield* Effect.sync(() =>
        symlinkSync(targets.attachments, at('attachments'), 'junction'),
      );
      yield* Effect.log(
        `Linked ${at('attachments')} to ${targets.attachments}`,
      );
    }

    yield* moveSpare(at('models.json'), targets.models);
    yield* moveSpare(at('speech-to-text'), targets.speech);
    yield* moveSpare(
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

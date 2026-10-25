import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveLegacy, resolvePaths } from './paths.js';

let home: string;
let legacy: string;

const write = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
};

const pathsIn = (home: string) =>
  resolvePaths({ env: {}, platform: process.platform, home });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'connect-legacy-'));
  legacy = join(home, '.ai-toolkit');
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('moveLegacy', () => {
  it('moves each old file into Connect’s folders and leaves a note', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'ai.db-wal'), 'wal');
    write(join(legacy, 'attachments', 's1', 'a.txt'), 'attached');
    write(join(legacy, 'models.json'), '{}');
    write(join(legacy, 'speech-to-text', 'model.onnx'), 'model');
    write(
      join(
        legacy,
        'bin',
        process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
      ),
      'binary',
    );
    write(join(legacy, 'dev.db'), 'dev');
    const paths = pathsIn(home);

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(readFileSync(`${paths.db}-wal`, 'utf8')).toBe('wal');
    expect(existsSync(`${paths.db}-shm`)).toBe(false);
    expect(readFileSync(join(paths.attachments, 's1', 'a.txt'), 'utf8')).toBe(
      'attached',
    );
    expect(readFileSync(paths.ai.models, 'utf8')).toBe('{}');
    expect(readFileSync(join(paths.ai.speech, 'model.onnx'), 'utf8')).toBe(
      'model',
    );
    expect(readFileSync(paths.cloudflared, 'utf8')).toBe('binary');
    expect(existsSync(join(legacy, 'ai.db'))).toBe(false);
    expect(readFileSync(join(legacy, 'dev.db'), 'utf8')).toBe('dev');
    expect(readFileSync(join(legacy, 'MOVED.txt'), 'utf8')).toContain(paths.db);
  });

  it('links the old attachments folder to the new one, for the paths old records name', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'attachments', 's1', 'a.txt'), 'attached');
    const paths = pathsIn(home);

    Effect.runSync(moveLegacy(paths, legacy));

    expect(lstatSync(join(legacy, 'attachments')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(legacy, 'attachments'))).toBe(paths.attachments);
    expect(
      readFileSync(join(legacy, 'attachments', 's1', 'a.txt'), 'utf8'),
    ).toBe('attached');
  });

  it('moves only what is there', () => {
    write(join(legacy, 'ai.db'), 'db');
    const paths = pathsIn(home);

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(existsSync(paths.attachments)).toBe(false);
    expect(existsSync(join(legacy, 'attachments'))).toBe(false);
    expect(existsSync(paths.ai.models)).toBe(false);
  });

  it('does nothing once Connect has its own database', () => {
    write(join(legacy, 'ai.db'), 'db');
    const paths = pathsIn(home);
    Effect.runSync(moveLegacy(paths, legacy));
    write(join(legacy, 'ai.db'), 'newer');
    write(join(legacy, 'models.json'), '{}');

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(readFileSync(join(legacy, 'ai.db'), 'utf8')).toBe('newer');
    expect(existsSync(paths.ai.models)).toBe(false);
  });

  it('finishes a move cut short, WAL first, and leaves no MOVING note', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'attachments', 's1', 'a.txt'), 'attached');
    write(join(legacy, 'models.json'), '{}');
    const paths = pathsIn(home);
    // Cut short after the WAL and the attachments moved, before the link.
    write(join(legacy, 'MOVING'), '');
    write(`${paths.db}-wal`, 'wal');
    write(join(paths.attachments, 's1', 'a.txt'), 'attached');
    rmSync(join(legacy, 'attachments'), { recursive: true });

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(readFileSync(`${paths.db}-wal`, 'utf8')).toBe('wal');
    expect(lstatSync(join(legacy, 'attachments')).isSymbolicLink()).toBe(true);
    expect(readFileSync(paths.ai.models, 'utf8')).toBe('{}');
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
  });

  it('finishes a move cut short after the database, without touching it again', () => {
    write(join(legacy, 'models.json'), '{}');
    write(join(legacy, 'MOVING'), '');
    const paths = pathsIn(home);
    write(paths.db, 'moved');
    write(join(legacy, 'ai.db'), 'newer');

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('moved');
    expect(readFileSync(join(legacy, 'ai.db'), 'utf8')).toBe('newer');
    expect(readFileSync(paths.ai.models, 'utf8')).toBe('{}');
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
  });

  it('finishes a move cut short after the attachments were put in place but before the old ones were deleted', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'attachments', 's1', 'a.txt'), 'attached');
    const paths = pathsIn(home);
    // Cut short across disks: the copy was put in place and noted, the old
    // folder stayed.
    write(
      join(legacy, 'MOVING'),
      JSON.stringify([join(legacy, 'attachments')]),
    );
    write(join(paths.attachments, 's1', 'a.txt'), 'attached');
    write(join(`${paths.attachments}.moving`, 's1', 'a.txt'), 'partial');

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(readFileSync(join(paths.attachments, 's1', 'a.txt'), 'utf8')).toBe(
      'attached',
    );
    expect(existsSync(`${paths.attachments}.moving`)).toBe(false);
    expect(lstatSync(join(legacy, 'attachments')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
  });

  it('finishes a move cut short after the WAL was put in place but before the old one was deleted', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'ai.db-wal'), 'wal');
    write(join(legacy, 'MOVING'), JSON.stringify([join(legacy, 'ai.db-wal')]));
    const paths = pathsIn(home);
    write(`${paths.db}-wal`, 'wal');

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(readFileSync(`${paths.db}-wal`, 'utf8')).toBe('wal');
    expect(existsSync(join(legacy, 'ai.db-wal'))).toBe(false);
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
  });

  it('never deletes old attachments over a folder this move did not put there, on any start', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'attachments', 's1', 'a.txt'), 'attached');
    const paths = pathsIn(home);
    write(join(paths.attachments, 'other.txt'), 'unrelated');

    for (const start of [1, 2]) {
      expect(
        () => Effect.runSync(moveLegacy(paths, legacy)),
        `start ${start}`,
      ).toThrow(
        `Cannot move ${join(legacy, 'attachments')} to ${paths.attachments}: both are there`,
      );
      expect(
        readFileSync(join(legacy, 'attachments', 's1', 'a.txt'), 'utf8'),
      ).toBe('attached');
      expect(readFileSync(join(paths.attachments, 'other.txt'), 'utf8')).toBe(
        'unrelated',
      );
      expect(existsSync(join(legacy, 'MOVING'))).toBe(true);
    }
  });

  it('moves the attachments in place of an empty folder', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'attachments', 's1', 'a.txt'), 'attached');
    const paths = pathsIn(home);
    mkdirSync(paths.attachments, { recursive: true });

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(join(paths.attachments, 's1', 'a.txt'), 'utf8')).toBe(
      'attached',
    );
    expect(lstatSync(join(legacy, 'attachments')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
  });

  it('keeps a speech model already in Connect’s folder, leaves the old one, and finishes', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'speech-to-text', 'model.onnx'), 'old');
    write(join(legacy, 'models.json'), '{"old":true}');
    const paths = pathsIn(home);
    write(join(paths.ai.speech, 'model.onnx'), 'downloaded');
    write(paths.ai.models, '{}');

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(readFileSync(join(paths.ai.speech, 'model.onnx'), 'utf8')).toBe(
      'downloaded',
    );
    expect(
      readFileSync(join(legacy, 'speech-to-text', 'model.onnx'), 'utf8'),
    ).toBe('old');
    expect(readFileSync(paths.ai.models, 'utf8')).toBe('{}');
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
    expect(existsSync(join(legacy, 'MOVED.txt'))).toBe(true);
  });

  it('finishes even when a file Connect can do without fails to move', () => {
    write(join(legacy, 'ai.db'), 'db');
    write(join(legacy, 'speech-to-text', 'model.onnx'), 'model');
    const paths = pathsIn(home);
    // Its folder's parent is a file, so the folder cannot be made.
    write(join(paths.ai.speech, '..'), 'in the way');

    Effect.runSync(moveLegacy(paths, legacy));

    expect(readFileSync(paths.db, 'utf8')).toBe('db');
    expect(
      readFileSync(join(legacy, 'speech-to-text', 'model.onnx'), 'utf8'),
    ).toBe('model');
    expect(existsSync(join(legacy, 'MOVING'))).toBe(false);
  });

  it('does nothing without an old database', () => {
    write(join(legacy, 'models.json'), '{}');
    const paths = pathsIn(home);

    Effect.runSync(moveLegacy(paths, legacy));

    expect(existsSync(paths.data)).toBe(false);
    expect(existsSync(join(legacy, 'MOVED.txt'))).toBe(false);
  });
});

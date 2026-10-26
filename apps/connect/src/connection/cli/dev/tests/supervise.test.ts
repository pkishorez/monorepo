import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pidAlive } from '../leases.js';
import { writeRecord } from '../record.js';
import { supervise } from '../supervise.js';

let dir: string;
let path: string | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'connect-supervise-'));
  path = process.env.PATH;
});
afterEach(() => {
  process.env.PATH = path;
  rmSync(dir, { recursive: true, force: true });
});

describe('supervise', () => {
  it.skipIf(process.platform === 'win32')(
    'stops a shared Connect whose Apps are gone while Cloud Connect never answers',
    async () => {
      // `portless` that stays up but never serves: Cloud Connect never answers.
      const bin = join(dir, 'bin');
      const pidFile = join(dir, 'alchemy.pid');
      const script = join(bin, 'portless');
      mkdirSync(bin);
      writeFileSync(
        script,
        `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 60\n`,
      );
      chmodSync(script, 0o755);
      process.env.PATH = `${bin}${delimiter}${path ?? ''}`;
      const cloud = 'http://127.0.0.1:1';
      writeRecord(dir, {
        pid: process.pid,
        mode: 'shared',
        cloud,
        port: 0,
        connection: null,
        ready: false,
        startedAt: new Date().toISOString(),
        version: 'test',
      });

      await Effect.runPromise(
        supervise({
          root: dir,
          dir,
          slug: 'test',
          cloud,
          mode: 'shared',
          auth: 'real',
          version: 'test',
        }),
      );

      expect(existsSync(join(dir, 'connect.json'))).toBe(false);
      expect(pidAlive(Number(readFileSync(pidFile, 'utf8')))).toBe(false);
    },
    15_000,
  );
});

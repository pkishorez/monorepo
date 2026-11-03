import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Deferred, Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { followFile, outputFilesOf, TAIL_BYTES } from '../output.js';

const result = (content: unknown) => ({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content }],
  },
});

const SAID =
  'Command running in background with ID: bjlu02. Output is being written to: /private/tmp/claude-501/-Users-me/s1/tasks/bjlu02.output. You will be notified when it completes.';

describe('outputFilesOf', () => {
  it('reads the task id and file a background command’s result names', () => {
    expect(outputFilesOf(result(SAID))).toEqual([
      ['bjlu02', '/private/tmp/claude-501/-Users-me/s1/tasks/bjlu02.output'],
    ]);
    expect(outputFilesOf(result([{ type: 'text', text: SAID }]))).toHaveLength(
      1,
    );
  });

  it('finds none in any other record', () => {
    expect(outputFilesOf(result('total 8\nfile.txt'))).toEqual([]);
    expect(outputFilesOf({ type: 'assistant', message: SAID })).toEqual([]);
  });
});

describe('followFile', () => {
  const folder = () => mkdtemp(join(tmpdir(), 'follow-'));

  it('gives what was written, then each piece as it comes, and the last after it ends', async () => {
    const path = join(await folder(), 'job.output');
    await writeFile(path, 'one\n');
    const pieces = await Effect.runPromise(
      Effect.gen(function* () {
        const ended = yield* Deferred.make<void>();
        const fiber = yield* followFile(path, Deferred.await(ended)).pipe(
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.sleep('400 millis');
        yield* Effect.promise(() => appendFile(path, 'two\n'));
        yield* Effect.sleep('400 millis');
        yield* Effect.promise(() => appendFile(path, 'three\n'));
        yield* Deferred.succeed(ended, undefined);
        return yield* Fiber.join(fiber);
      }),
    );
    expect(pieces.join('')).toBe('one\ntwo\nthree\n');
  });

  it('starts a long file at a whole line near its end', async () => {
    const path = join(await folder(), 'long.output');
    const line = `${'x'.repeat(99)}\n`;
    await writeFile(path, `${line.repeat(TAIL_BYTES / 100 + 50)}last\n`);
    const text = await Effect.runPromise(
      followFile(path, Effect.void).pipe(Stream.mkString),
    );
    expect(text.length).toBeLessThanOrEqual(TAIL_BYTES);
    expect(text.startsWith('x')).toBe(true);
    expect(text.endsWith('last\n')).toBe(true);
  });

  it('reads a file not there yet as nothing', async () => {
    const path = join(await folder(), 'none.output');
    const text = await Effect.runPromise(
      followFile(path, Effect.void).pipe(Stream.mkString),
    );
    expect(text).toBe('');
  });
});

describe('followFile, from a line’s start', () => {
  it('keeps a whole line the tail starts on', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'follow-')), 'edge.output');
    // The byte before the last TAIL_BYTES is a newline: the tail starts a line.
    const head = `${'h'.repeat(99)}\n`;
    const tail = `${'t'.repeat(TAIL_BYTES - 1)}\n`;
    await writeFile(path, head.repeat(3) + tail);
    const text = await Effect.runPromise(
      followFile(path, Effect.void).pipe(Stream.mkString),
    );
    expect(text).toBe(tail);
  });
});

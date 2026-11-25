import { Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import { capture, Failed, lines, pipe } from '../process.ts';

const node = process.execPath;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('lines', () => {
  it('hands over each line in order, \\r ending a line too, and keeps the stderr tail', async () => {
    const seen: Array<string> = [];
    const ended = await Effect.runPromise(
      lines(
        node,
        [
          '-e',
          'process.stdout.write("a\\rb\\nc"); console.error("oops"); process.exit(3)',
        ],
        (text, from) => Effect.sync(() => void seen.push(`${from}:${text}`)),
      ),
    );
    expect(seen.filter((s) => s.startsWith('out:'))).toEqual([
      'out:a',
      'out:b',
      'out:c',
    ]);
    expect(ended).toEqual({ code: 3, tail: ['oops'] });
  });

  it('fails when the program cannot start', async () => {
    const exit = await Effect.runPromiseExit(
      lines('no-such-program-ke-video', []),
    );
    expect(exit._tag).toBe('Failure');
  });

  it('stops the program when interrupted', async () => {
    let pid = 0;
    const fiber = Effect.runFork(
      lines(
        node,
        ['-e', 'console.log(process.pid); setInterval(() => {}, 1000)'],
        (text) =>
          Effect.sync(() => {
            pid = Number(text);
          }),
      ),
    );
    while (pid === 0) await new Promise((r) => setTimeout(r, 20));
    expect(alive(pid)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(alive(pid)).toBe(false);
  });

  it('kills a program that ignores SIGTERM', async () => {
    let pid = 0;
    const fiber = Effect.runFork(
      lines(
        node,
        [
          '-e',
          'process.on("SIGTERM", () => {}); console.log(process.pid); setInterval(() => {}, 1000)',
        ],
        (text) =>
          Effect.sync(() => {
            pid = Number(text);
          }),
      ),
    );
    while (pid === 0) await new Promise((r) => setTimeout(r, 20));
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(alive(pid)).toBe(false);
  }, 10_000);
});

describe('capture', () => {
  it('keeps all of stdout', async () => {
    const ended = await Effect.runPromise(
      capture(node, ['-e', 'process.stdout.write("x".repeat(200000))']),
    );
    expect(ended.code).toBe(0);
    expect(ended.out.length).toBe(200000);
  });

  it('fails with Failed when the program cannot start', async () => {
    const exit = await Effect.runPromiseExit(
      capture('no-such-program-ke-video', []),
    );
    expect(exit._tag === 'Failure' && JSON.stringify(exit.cause)).toContain(
      'could not start',
    );
    expect(Failed).toBeDefined();
  });
});

describe('pipe', () => {
  it('runs one program into another through a change', async () => {
    const ended = await Effect.runPromise(
      pipe(
        [node, ['-e', 'process.stdout.write("hello")']],
        [
          node,
          [
            '-e',
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(s==="HELLO"?0:5))',
          ],
        ],
        (chunk) => Buffer.from(chunk.toString().toUpperCase()),
      ),
    );
    expect(ended.from.code).toBe(0);
    expect(ended.to.code).toBe(0);
  });
});

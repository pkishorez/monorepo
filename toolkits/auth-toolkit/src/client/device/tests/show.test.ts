import { Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import { showIn, type Terminal } from '../show.js';

const fakeTerminal = (interactive: boolean) => {
  const printed: string[] = [];
  const launched: string[] = [];
  let onKey: ((key: string) => void) | null = null;
  let stopped = false;
  const terminal: Terminal = {
    print: (line) => void printed.push(line),
    interactive,
    listen: (listener) => {
      onKey = listener;
      return () => {
        onKey = null;
        stopped = true;
      };
    },
    launch: (url) => void launched.push(url),
  };
  return {
    terminal,
    printed,
    launched,
    press: (key: string) => onKey?.(key),
    stopped: () => stopped,
  };
};

const login = { url: 'https://auth.example.com/device?code=AB', code: 'AB' };

describe('showIn', () => {
  it('only prints without a person at the terminal', async () => {
    const fake = fakeTerminal(false);
    await Effect.runPromise(
      showIn(fake.terminal)({ ...login, open: 'prompt' }),
    );
    await Effect.runPromise(showIn(fake.terminal)({ ...login, open: 'auto' }));
    expect(fake.printed).toEqual([
      `To sign in, open ${login.url}`,
      'and check it shows the code AB.',
      `To sign in, open ${login.url}`,
      'and check it shows the code AB.',
    ]);
    expect(fake.launched).toEqual([]);
  });

  it('opens the browser at once when auto', async () => {
    const fake = fakeTerminal(true);
    await Effect.runPromise(showIn(fake.terminal)({ ...login, open: 'auto' }));
    expect(fake.launched).toEqual([login.url]);
  });

  it('opens on o when prompting, and puts the terminal back once done', async () => {
    const fake = fakeTerminal(true);
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          showIn(fake.terminal)({ ...login, open: 'prompt' }),
          { startImmediately: true },
        );
        expect(fake.printed.at(-1)).toBe('Press o to open it in your browser.');
        fake.press('x');
        expect(fake.launched).toEqual([]);
        fake.press('o');
        expect(fake.launched).toEqual([login.url]);
        // The login ended: the prompt is put away.
        yield* Fiber.interrupt(fiber);
      }),
    );
    expect(fake.stopped()).toBe(true);
  });
});

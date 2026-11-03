import { Deferred, Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { KEPT_CHARS, makeOutputs } from '../output.js';

const delta = (itemId: string, text: string) => ({
  method: 'item/commandExecution/outputDelta',
  params: { threadId: 'main', turnId: 't', itemId, delta: text },
});

const completed = (itemId: string) => ({
  method: 'item/completed',
  params: {
    threadId: 'main',
    turnId: 't',
    item: { type: 'commandExecution', id: itemId },
  },
});

const terminal = (itemId: string) => ({
  itemId,
  processId: `p-${itemId}`,
  command: 'pnpm dev',
});

describe('outputs', () => {
  it('gives a command’s output from its start, then each piece as it comes, until it ends', async () => {
    const outputs = makeOutputs();
    outputs.observe(delta('i1', 'ready\n'));
    const pieces = await Effect.runPromise(
      Effect.gen(function* () {
        const ended = yield* Deferred.make<void>();
        const fiber = yield* outputs
          .follow('i1', Deferred.await(ended))
          .pipe(Stream.runCollect, Effect.forkChild);
        yield* Effect.sleep('20 millis');
        outputs.observe(delta('i1', 'hmr update\n'));
        outputs.observe(delta('other', 'not this\n'));
        yield* Effect.sleep('20 millis');
        yield* Deferred.succeed(ended, undefined);
        return yield* Fiber.join(fiber);
      }),
    );
    expect(pieces).toEqual(['ready\n', 'hmr update\n']);
  });

  it('keeps only the last of a long output', async () => {
    const outputs = makeOutputs();
    outputs.observe(delta('i1', 'a'.repeat(KEPT_CHARS)));
    outputs.observe(delta('i1', 'end'));
    const text = await Effect.runPromise(
      outputs.follow('i1', Effect.void).pipe(Stream.take(1), Stream.mkString),
    );
    expect(text).toHaveLength(KEPT_CHARS);
    expect(text.endsWith('end')).toBe(true);
  });

  it('forgets a completed command once no terminal runs it', async () => {
    const outputs = makeOutputs();
    outputs.observe(delta('bg', 'server up\n'));
    outputs.observe(delta('fg', 'done\n'));
    outputs.observe(completed('bg'));
    outputs.observe(completed('fg'));
    outputs.prune([terminal('bg')]);
    const first = (itemId: string) =>
      Effect.runPromise(
        outputs
          .follow(itemId, Effect.void)
          .pipe(Stream.take(1), Stream.runCollect),
      );
    expect(await first('bg')).toEqual(['server up\n']);
    expect(await first('fg')).toEqual([]);
  });
});

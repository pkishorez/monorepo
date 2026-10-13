import { Effect, Schema } from 'effect';
import { RUN } from './types.ts';
import type { Command as Made } from './types.ts';

/*
 * A Command is made once, outside any Update, from a name, the Schema of its
 * args and an Effect run from them. What an Update asks for is the made
 * Command called with its args: plain data, `{ name, args }`, that a test can
 * compare without running it. The Effect hangs off a hidden key, so it never
 * shows in a comparison and an inline `{ name, run }` is not a Command.
 *
 * The args are checked against their Schema when the Runtime runs the
 * Command, never in the Update: a mismatch is a defect, reported like any
 * Command failure.
 */

/** A Schema Kabuki can read without Capabilities and at once. */
type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** Throws, naming the Command, unless `schema` describes its args. */
const checkerOf = (name: string, schema: Codec<unknown> | undefined) => {
  if (!schema) return () => {};
  const decode = Schema.decodeUnknownSync(Schema.toType(schema));
  return (args: unknown) => {
    try {
      decode(args);
    } catch (error) {
      throw new TypeError(
        `[@kestack/kabuki] Command ${name}: its args do not match their Schema\n${(error as Error).message}`,
      );
    }
  };
};

const make: {
  <Args, Out, Ids = never>(
    name: string,
    options: {
      readonly args: Codec<Args>;
      readonly run: (args: Args) => Effect.Effect<Out, never, Ids>;
    },
  ): (args: Args) => Made<Out, Ids>;
  <Out, Ids = never>(
    name: string,
    options: {
      readonly args?: never;
      readonly run: () => Effect.Effect<Out, never, Ids>;
    },
  ): () => Made<Out, Ids>;
} = (
  name: string,
  options: {
    readonly args?: Codec<unknown>;
    readonly run: (args?: unknown) => Effect.Effect<unknown, never, unknown>;
  },
) => {
  const check = checkerOf(name, options.args);
  return (args?: unknown) =>
    Object.defineProperty({ name, args }, RUN, {
      value: Effect.suspend(() => {
        check(args);
        return options.run(args);
      }),
    }) as Made<unknown, unknown>;
};

/**
 * An errand an Update asks for. `make` takes its name, the Schema of its args
 * and the Effect it runs from them, and gives what an Update calls with the
 * args: `{ command: Search({ query }) }`.
 */
export const Command = { make };
export type Command<Out, Ids = never> = Made<Out, Ids>;

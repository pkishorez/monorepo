import { createTransaction, type Transaction } from '@tanstack/db';
import { Command } from '@kestack/kabuki';
import { Cause, Context, Effect, Exit, Schema } from 'effect';
import type { Scope } from 'effect';
import { ReplicaError } from '../definition/index.js';
import { Holding } from '../replicas/index.js';

/*
 * An Action: a named write, as a Kabuki Command. Its `run` gets the
 * Instances it writes, by the Keys its args name, makes Optimistic Changes
 * to their Collections, calls the Backend, and Confirms what came back.
 *
 * 1. Hold      every Instance it gets runs until it ends, and shows it as
 *              pending.
 * 2. Change    `Action.optimistic` puts its changes, across Instances and
 *              Replicas, in one TanStack DB transaction.
 * 3. Settle    success commits the transaction, so what Confirm stored
 *              shows in place of the changes; a failure anywhere rolls every
 *              one of them back. Either way it ends with one Message.
 */

/** The Optimistic Changes of the Action running, once it made one. */
type Optimism = { transaction: Transaction | null };

const Optimism = Context.Reference<Optimism | null>(
  '@kestack/std-toolkit/replica/Optimism',
  {
    defaultValue: () => null,
  },
);

/** How an Action ends, as its Message's fields: `failed` says why, or is `null`. */
const result = { failed: Schema.NullOr(Schema.String) };

/** The Message an Action ends with, tagged with its name. */
export type Ended<Name extends string> = {
  readonly _tag: Name;
  readonly failed: string | null;
};

const messageOf = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
};

// 3. Settle
const settle = (optimism: Optimism, exit: Exit.Exit<unknown, unknown>) =>
  Effect.suspend(() => {
    const { transaction } = optimism;
    if (transaction === null) return Effect.void;
    if (Exit.isFailure(exit)) return Effect.sync(() => transaction.rollback());
    return Effect.promise(() => {
      transaction.commit();
      return transaction.isPersisted.promise;
    }).pipe(Effect.asVoid);
  });

const make = <const Name extends string, Args, A, E, R>(
  name: Name,
  options: {
    readonly args: Schema.Codec<Args, unknown, never, never>;
    readonly run: (args: Args) => Effect.Effect<A, E, R>;
  },
): ((args: Args) => Command<Ended<Name>, Exclude<R, Scope.Scope>>) =>
  Command.make(name, {
    args: options.args,
    run: (args) =>
      Effect.gen(function* () {
        const optimism: Optimism = { transaction: null };
        return yield* options.run(args).pipe(
          Effect.onExit((exit) => settle(optimism, exit)),
          // 1. Hold
          Effect.provideService(Holding, { holder: name, action: true }),
          Effect.provideService(Optimism, optimism),
        );
      }).pipe(
        Effect.scoped,
        Effect.exit,
        Effect.map((exit): Ended<Name> => ({
          _tag: name,
          failed: Exit.isSuccess(exit) ? null : messageOf(exit.cause),
        })),
      ),
  });

// 2. Change
const optimistic = (change: () => void) =>
  Effect.gen(function* () {
    const optimism = yield* Optimism;
    if (optimism === null)
      return yield* new ReplicaError({
        message: 'Action.optimistic runs only inside an Action',
      });
    const transaction = (optimism.transaction ??= createTransaction({
      autoCommit: false,
      // Confirm has stored what the Backend returned by the time it commits.
      mutationFn: async () => {},
    }));
    yield* Effect.try({
      try: () => transaction.mutate(change),
      catch: (cause) =>
        new ReplicaError({ message: 'An Optimistic Change failed', cause }),
    });
  });

/**
 * A named write. `make` mirrors `Command.make`: an Update asks for it with
 * its args, and it ends with one Message tagged with its name, whose fields
 * are `result`. `optimistic` makes Optimistic Changes inside its `run`.
 */
export const Action = { make, optimistic, result };

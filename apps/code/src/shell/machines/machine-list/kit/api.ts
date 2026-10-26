import { Effect, Schedule, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * What a Machine Kit asks of its Machine, over the Machine's own socket:
 * its Harness Accounts, its agents and each one's models, asked together;
 * and its Speech to Text, watched.
 */

/** Why a call was refused, as a person reads it. */
const reasonOf = (error: {
  readonly _tag: string;
  readonly message?: string;
}) =>
  error._tag === 'ModelsUnavailable'
    ? 'Could not load the models'
    : error.message || 'The Machine could not be reached';

/**
 * The Machine's Harness Accounts, its agents, and the models of each that
 * runs, as the Message answering the ask `since`; a model list refused is
 * said for its account alone.
 */
export const ask = (machineId: string, since: number) =>
  CodeClients.on(
    machineId,
    Effect.gen(function* () {
      const api = yield* CodeClient;
      const [accounts, harnesses] = yield* Effect.all(
        [api.harnessAccounts(), api.harnesses()],
        { concurrency: 'unbounded' },
      );
      const models = yield* Effect.forEach(
        harnesses.filter(({ available }) => available),
        ({ account }) =>
          api.models({ account }).pipe(
            Effect.map((list) => ({ account, list, problem: null })),
            Effect.catch((error) =>
              Effect.succeed({
                account,
                list: [],
                problem: reasonOf(error),
              }),
            ),
          ),
        { concurrency: 'unbounded' },
      );
      return {
        _tag: 'Answered' as const,
        since,
        accounts,
        harnesses,
        models,
      };
    }),
  ).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        _tag: 'Refused' as const,
        since,
        reason: reasonOf(error),
      }),
    ),
  );

/** How Speech to Text stands on the Machine, now and on each change; a feed it refuses is tried again a little later. */
export const speechOn = (machineId: string) =>
  CodeClients.stream(
    machineId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(CodeClient, (api) => api.watchSpeechToText())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );

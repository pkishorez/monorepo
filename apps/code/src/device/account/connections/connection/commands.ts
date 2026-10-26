import { Effect, Schedule, Schema, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { Cache, dropEverywhere, shelf } from './store/index.ts';
import { Connections, SetupParts } from '../connections.ts';
import { reasonOf } from './link/index.ts';

/*
 * What a Connection is asked, and what this device keeps of what it said.
 *
 * 1. Setup   its Harness Accounts, its agents and each one's models, asked
 *            together over its own socket, and its Speech to Text,
 *            watched; asked again, as the project's catalog and Settings'
 *            Harness Accounts ask it, through `Connections`; and kept here.
 * 2. Remove  a Project, as the project page and Settings ask it, over the
 *            Connection's own socket: the Connection removes it and its
 *            Sessions, then this device forgets all it kept of it in its
 *            Connection's database, for the Account signed in: the Saved
 *            Drafts of its new session and its Sessions, their Unseen
 *            marks, and its Skills.
 */

// 1. Setup
/** Why a call was refused, as a person reads it. */
const setupRefusal = (error: {
  readonly _tag: string;
  readonly message?: string;
}) =>
  error._tag === 'ModelsUnavailable'
    ? 'Could not load the models'
    : error.message || 'The Connection could not be reached';

/**
 * The Connection's Harness Accounts, its agents, and the models of each that
 * runs, as the Message answering the ask `since`; a model list refused is
 * said for its account alone.
 */
export const ask = (connectionId: string, since: number) =>
  CodeClients.on(
    connectionId,
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
                problem: setupRefusal(error),
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
        reason: setupRefusal(error),
      }),
    ),
  );

/** How Speech to Text stands on the Connection, now and on each change; a feed it refuses is tried again a little later. */
export const speechOn = (connectionId: string) =>
  CodeClients.stream(
    connectionId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(CodeClient, (api) => api.watchSpeechToText())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );

/** A Connection's setup as kept, in its database's `setup` table. */
export const SetupShelf = shelf('setup', 1, SetupParts);

/** Keeps what the Connection said, the models it could not list left out; a write that fails is lost. */
export const keepSetup = Command.make('KeepSetup', {
  args: Schema.Struct({
    accountId: Schema.String,
    connectionId: Schema.String,
    parts: SetupParts,
  }),
  run: ({ accountId, connectionId, parts }) =>
    Effect.flatMap(Cache, (kept) =>
      kept.write(
        SetupShelf,
        { accountId, connectionId, projectId: null },
        {
          ...parts,
          models: parts.models.filter(({ problem }) => problem === null),
        },
      ),
    ),
});

/** Asks the Connection for its setup again. */
export const refreshSetup = Command.make('RefreshSetup', {
  args: Schema.Struct({ connectionId: Schema.String }),
  run: ({ connectionId }) =>
    Effect.flatMap(Connections, (connections) =>
      connections.refresh(connectionId),
    ),
});

// 2. Remove
/** Removes a Project; its folder is never touched. */
export const removeProject = Command.make('RemoveProject', {
  args: Schema.Struct({ connectionId: Schema.String, id: Schema.String }),
  run: ({ connectionId, id }) =>
    CodeClients.on(
      connectionId,
      CodeClient.use((api) => api.removeProject({ id })),
    ).pipe(
      Effect.andThen(Effect.flatMap(Connections, ({ account }) => account)),
      Effect.flatMap((accountId) =>
        dropEverywhere({
          _tag: 'Project',
          accountId,
          connectionId,
          projectId: id,
        }),
      ),
      Effect.as({ _tag: 'Removed' as const }),
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'RemoveRefused' as const,
          reason: reasonOf(cause),
        }),
      ),
    ),
});

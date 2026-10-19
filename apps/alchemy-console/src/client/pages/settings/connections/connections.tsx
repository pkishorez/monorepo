import { Effect, Schedule, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { PlusIcon } from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { GitHubConnection } from '../../../../shared/contracts/github/index.ts';
import { Api, Browser } from '../../../../shared/pages/index.ts';
import { add, remove } from './commands.ts';
import {
  ConnectionList,
  ConnectionsSkeleton,
  NoConnections,
  RemoveDialog,
} from './list.tsx';

/*
 * The GitHub section of Settings.
 *
 * 1. Follow  a Worker follows the member's connections, so one made or
 *            removed in any tab shows here at once; until it speaks, the
 *            list the page was drawn with stands in.
 * 2. Add     leaves for GitHub's install page, coming back here.
 * 3. Remove  asked in a dialog, and one call.
 */

export const Connections = Actor.define('Connections', {
  requires: [Api, Browser],
  props: Schema.Struct({
    /** The connections the page was drawn with. */
    drawn: Schema.NullOr(Schema.Array(GitHubConnection)),
  }),
  model: Schema.Struct({
    /** As the User Space last said; null until it has. */
    live: Schema.NullOr(Schema.Array(GitHubConnection)),
    /** On the way to GitHub. */
    connecting: Schema.Boolean,
    /** Whether the remove dialog is open. */
    removing: Schema.Boolean,
    /** The connection the dialog was for, kept while it closes. */
    target: Schema.NullOr(Schema.String),
    busy: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Listed: { connections: Schema.Array(GitHubConnection) },
    AddChosen: {},
    AddFailed: { message: Schema.String },
    RemoveChosen: { connectionId: Schema.String },
    RemoveConfirmed: {},
    RemoveClosed: {},
    RemoveDone: {},
    RemoveFailed: { message: Schema.String },
  }),
});

export const ConnectionsLive = Actor.build(Connections, {
  init: () => ({
    model: {
      live: null,
      connecting: false,
      removing: false,
      target: null,
      busy: false,
      problem: null,
    },
  }),
  // 1. Follow
  workers: {
    list: {
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          yield* api
            .follow((client) => client['Connections.list']())
            .pipe(
              Stream.runForEach((connections) =>
                self.send({ _tag: 'Listed', connections }),
              ),
            );
        }).pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie),
    },
  },
  on: {
    Listed: ({ connections }, { model }) => ({
      model: { ...model, live: connections },
    }),
    // 2. Add
    AddChosen: (_, { model }) =>
      model.connecting
        ? {}
        : {
            model: { ...model, connecting: true, problem: null },
            command: add(),
          },
    AddFailed: ({ message }, { model }) => ({
      model: { ...model, connecting: false, problem: message },
    }),
    // 3. Remove
    RemoveChosen: ({ connectionId }, { model }) =>
      model.busy
        ? {}
        : {
            model: {
              ...model,
              removing: true,
              target: connectionId,
              problem: null,
            },
          },
    RemoveConfirmed: (_, { model }) =>
      model.busy || model.target === null
        ? {}
        : {
            model: { ...model, busy: true, problem: null },
            command: remove({ connectionId: model.target }),
          },
    RemoveClosed: (_, { model }) =>
      model.busy ? {} : { model: { ...model, removing: false } },
    RemoveDone: (_, { model }) => ({
      model: { ...model, busy: false, removing: false },
    }),
    RemoveFailed: ({ message }, { model }) => ({
      model: { ...model, busy: false, problem: message },
    }),
  },
});

export const ConnectionsView = View.make(
  ConnectionsLive,
  ({ model, props, send, root }) => {
    const connections = model.live ?? props.drawn;
    const target =
      connections?.find((c) => c.connectionId === model.target) ?? null;
    const addChosen = () => send({ _tag: 'AddChosen' });
    return (
      <section
        {...root}
        aria-labelledby="connections-title"
        className="flex flex-col gap-5"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="connections-title" className="text-lg font-semibold">
              GitHub
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              The accounts and organizations whose repositories your projects
              deploy from.
            </p>
          </div>
          {connections !== null && connections.length > 0 && (
            <Button
              variant="outline"
              className="shrink-0"
              onClick={addChosen}
              disabled={model.connecting}
            >
              {model.connecting ? (
                <Spinner aria-hidden />
              ) : (
                <PlusIcon aria-hidden />
              )}
              Add GitHub account
            </Button>
          )}
        </header>
        {model.problem !== null && !model.removing && (
          <p role="alert" className="text-sm text-destructive">
            {model.problem}
          </p>
        )}
        {connections === null ? (
          <ConnectionsSkeleton />
        ) : connections.length === 0 ? (
          <NoConnections connecting={model.connecting} onAdd={addChosen} />
        ) : (
          <ConnectionList
            connections={connections}
            onRemove={(connectionId) =>
              send({ _tag: 'RemoveChosen', connectionId })
            }
          />
        )}
        <RemoveDialog
          open={model.removing}
          connection={target}
          busy={model.busy}
          problem={model.removing ? model.problem : null}
          onClose={() => send({ _tag: 'RemoveClosed' })}
          onRemove={() => send({ _tag: 'RemoveConfirmed' })}
        />
      </section>
    );
  },
);

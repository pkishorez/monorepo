import { Effect, Layer, Schedule, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { PlusIcon } from '@kestack/web-platform/components/lucide';
import {
  CredentialSummary,
  nameProblem,
} from '../../../../shared/contracts/credential/index.ts';
import { Api } from '../../../../shared/pages/index.ts';
import {
  AddCredentialLive,
  AddCredentialOpener,
  AddCredentialSheet,
} from '../../../add-credential/index.ts';
import { remove, rename } from './commands.ts';
import { RemoveDialog, RenameDialog } from './dialogs.tsx';
import {
  CredentialGroups,
  CredentialsSkeleton,
  NoCredentials,
} from './list.tsx';

/*
 * The Credentials section of Settings.
 *
 * 1. Follow  a Worker follows the member's credentials, so a change in any
 *            tab shows here at once; until it speaks, the list the page was
 *            drawn with stands in.
 * 2. Add     the add-credential sheet is a Child, opened with any provider;
 *            it tells this section when it has added one, or was closed.
 * 3. Edit    a rename or a removal is asked in a dialog, and is one call.
 */

const Edit = Schema.Literals(['rename', 'remove']);

export const Credentials = Actor.define('Credentials', {
  requires: [Api],
  props: Schema.Struct({
    /** The credentials the page was drawn with. */
    drawn: Schema.NullOr(Schema.Array(CredentialSummary)),
  }),
  model: Schema.Struct({
    /** As the User Space last said; null until it has. */
    live: Schema.NullOr(Schema.Array(CredentialSummary)),
    adding: Schema.Boolean,
    /** The dialog open now, if any. */
    editing: Schema.NullOr(Edit),
    /** The credential the last dialog was for, kept while it closes. */
    target: Schema.NullOr(Schema.String),
    busy: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Listed: { credentials: Schema.Array(CredentialSummary) },
    AddChosen: {},
    AddClosed: {},
    Added: { credentialId: Schema.String },
    EditChosen: { edit: Edit, credentialId: Schema.String },
    RenameSubmitted: { name: Schema.String },
    RemoveConfirmed: {},
    EditClosed: {},
    EditDone: {},
    EditFailed: { message: Schema.String },
  }),
});

export const CredentialsLive = Actor.build(Credentials, {
  init: () => ({
    model: {
      live: null,
      adding: false,
      editing: null,
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
            .follow((client) => client['Credentials.list']())
            .pipe(
              Stream.runForEach((credentials) =>
                self.send({ _tag: 'Listed', credentials }),
              ),
            );
        }).pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie),
    },
  },
  // 2. Add
  children: {
    sheet: {
      actor: AddCredentialLive,
      props: ({ model }) => ({ open: model.adding, provider: null }),
    },
  },
  provides: (self) =>
    Layer.succeed(
      AddCredentialOpener,
      AddCredentialOpener.of({
        added: (credentialId) => self.send({ _tag: 'Added', credentialId }),
        closed: self.send({ _tag: 'AddClosed' }),
      }),
    ),
  on: {
    Listed: ({ credentials }, { model }) => ({
      model: { ...model, live: credentials },
    }),
    AddChosen: (_, { model }) => ({ model: { ...model, adding: true } }),
    AddClosed: (_, { model }) => ({ model: { ...model, adding: false } }),
    Added: (_, { model }) => ({ model: { ...model, adding: false } }),
    // 3. Edit
    EditChosen: ({ edit, credentialId }, { model }) =>
      model.busy
        ? {}
        : {
            model: {
              ...model,
              editing: edit,
              target: credentialId,
              problem: null,
            },
          },
    RenameSubmitted: ({ name }, { model }) => {
      if (model.busy || model.target === null) return {};
      const problem = nameProblem(name);
      return problem !== null
        ? { model: { ...model, problem } }
        : {
            model: { ...model, busy: true, problem: null },
            command: rename({ credentialId: model.target, name }),
          };
    },
    RemoveConfirmed: (_, { model }) =>
      model.busy || model.target === null
        ? {}
        : {
            model: { ...model, busy: true, problem: null },
            command: remove({ credentialId: model.target }),
          },
    EditClosed: (_, { model }) =>
      model.busy ? {} : { model: { ...model, editing: null } },
    EditDone: (_, { model }) => ({
      model: { ...model, busy: false, editing: null },
    }),
    EditFailed: ({ message }, { model }) => ({
      model: { ...model, busy: false, problem: message },
    }),
  },
});

export const CredentialsView = View.make(
  CredentialsLive,
  ({ model, props, children, send, root }) => {
    const credentials = model.live ?? props.drawn;
    const target =
      credentials?.find((c) => c.credentialId === model.target) ?? null;
    const add = () => send({ _tag: 'AddChosen' });
    const edit = {
      credential: target,
      busy: model.busy,
      problem: model.problem,
      onClose: () => send({ _tag: 'EditClosed' }),
    };
    return (
      <section
        {...root}
        aria-labelledby="credentials-title"
        className="flex flex-col gap-5"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="credentials-title" className="text-lg font-semibold">
              Credentials
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              The provider keys your projects deploy with. Pick one for each
              environment.
            </p>
          </div>
          {credentials !== null && credentials.length > 0 && (
            <Button variant="outline" className="shrink-0" onClick={add}>
              <PlusIcon aria-hidden />
              Add credential
            </Button>
          )}
        </header>
        {credentials === null ? (
          <CredentialsSkeleton />
        ) : credentials.length === 0 ? (
          <NoCredentials onAdd={add} />
        ) : (
          <CredentialGroups
            credentials={credentials}
            onRename={(credentialId) =>
              send({ _tag: 'EditChosen', edit: 'rename', credentialId })
            }
            onRemove={(credentialId) =>
              send({ _tag: 'EditChosen', edit: 'remove', credentialId })
            }
          />
        )}
        <AddCredentialSheet instance={children.sheet} />
        <RenameDialog
          {...edit}
          open={model.editing === 'rename'}
          onRename={(name) => send({ _tag: 'RenameSubmitted', name })}
        />
        <RemoveDialog
          {...edit}
          open={model.editing === 'remove'}
          onRemove={() => send({ _tag: 'RemoveConfirmed' })}
        />
      </section>
    );
  },
);

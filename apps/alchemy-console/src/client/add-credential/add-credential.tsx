import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { FieldGroup } from '@kestack/web-platform/components/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@kestack/web-platform/components/sheet';
import { Spinner } from '@kestack/web-platform/components/spinner';
import {
  CredentialField,
  inputProblem,
  Provider,
} from '../../shared/contracts/credential/index.ts';
import { Api } from '../../shared/pages/index.ts';
import { add, announce, close, drop } from './commands.ts';
import {
  AwsFields,
  CloudflareFields,
  inputOf,
  NameField,
  PROVIDER_LABEL,
  ProviderChoice,
} from './fields.tsx';
import { holdKeys } from './held-keys.ts';
import { AddCredentialOpener } from './opener.ts';

export { AddCredentialOpener };

/*
 * Adding one Provider credential, in a sheet any screen can open: Settings
 * with a choice of provider, New project with the provider it needs.
 *
 * 1. Hold    the opener holds `AddCredentialLive` as a Child, hands it
 *            `open` and the `provider` it needs (null lets the user
 *            choose), and Provides an `AddCredentialOpener`.
 * 2. Check   a submitted form is checked in the browser first, so a
 *            field that cannot be right is named at once.
 * 3. Add     then the User Space asks the provider, and keeps the keys
 *            sealed; a field the provider blames shows its words under it.
 *            The keys never ride in a Message, which the History keeps:
 *            the form holds them (`held-keys.ts`) and the Message carries
 *            a handle to them.
 * 4. Answer  the opener hears the new credential's ID, or that the user
 *            closed the sheet. Closing starts a new attempt, so the answer
 *            to one sent before is ignored.
 */

const Problem = Schema.Struct({
  field: Schema.NullOr(CredentialField),
  message: Schema.String,
});

export const AddCredential = Actor.define('AddCredential', {
  requires: [Api, AddCredentialOpener],
  props: Schema.Struct({
    open: Schema.Boolean,
    /** The provider the opener needs; null lets the user choose. */
    provider: Schema.NullOr(Provider),
  }),
  model: Schema.Struct({
    /** The provider the user chose, when the opener left it to them. */
    chosen: Provider,
    /** The Cloudflare account ID typed so far, for the token link. Not secret. */
    accountId: Schema.String,
    /** Counts the sends and closes, so an answer names the one it is for. */
    attempt: Schema.Number,
    busy: Schema.Boolean,
    problem: Schema.NullOr(Problem),
  }),
  message: Schema.TaggedUnion({
    ProviderChosen: { provider: Provider },
    AccountIdTyped: { accountId: Schema.String },
    Invalid: { problem: Problem },
    /** The form's keys, held under `handle`. */
    Submitted: { handle: Schema.String },
    Added: { attempt: Schema.Number, credentialId: Schema.String },
    Refused: { attempt: Schema.Number, problem: Problem },
    CloseChosen: {},
  }),
});

const fresh = {
  chosen: 'cloudflare' as const,
  accountId: '',
  attempt: 0,
  busy: false,
  problem: null,
};

export const AddCredentialLive = Actor.build(AddCredential, {
  init: () => ({ model: fresh }),
  on: {
    ProviderChosen: ({ provider }, { model }) => ({
      model: { ...model, chosen: provider, problem: null },
    }),
    AccountIdTyped: ({ accountId }, { model }) => ({
      model: { ...model, accountId },
    }),
    // 2. Check, and 3. Add
    Invalid: ({ problem }, { model }) =>
      model.busy ? {} : { model: { ...model, problem } },
    Submitted: ({ handle }, { model }) => {
      if (model.busy) return { command: drop({ handle }) };
      const attempt = model.attempt + 1;
      return {
        model: { ...model, attempt, busy: true, problem: null },
        command: add({ handle, attempt }),
      };
    },
    // 4. Answer
    Added: ({ attempt, credentialId }, { model }) =>
      attempt !== model.attempt
        ? {}
        : {
            model: { ...fresh, attempt },
            command: announce({ credentialId }),
          },
    Refused: ({ attempt, problem }, { model }) =>
      attempt !== model.attempt
        ? {}
        : { model: { ...model, busy: false, problem } },
    CloseChosen: (_, { model }) => ({
      model: { ...fresh, chosen: model.chosen, attempt: model.attempt + 1 },
      command: close({}),
    }),
  },
});

/**
 * The sheet itself: full width on a phone, a side panel from `sm` up, its
 * submit button always in reach at the bottom.
 */
export const AddCredentialSheet = View.make(
  AddCredentialLive,
  ({ props, model, send, root }) => {
    const provider = props.provider ?? model.chosen;
    const label = PROVIDER_LABEL[provider];
    const problemAt = (field: CredentialField) =>
      model.problem?.field === field ? model.problem.message : null;
    return (
      <div {...root} className="contents">
        <Sheet
          open={props.open}
          onOpenChange={(open) =>
            open ? undefined : send({ _tag: 'CloseChosen' })
          }
        >
          <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <form
              noValidate
              aria-busy={model.busy || undefined}
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (model.busy) return;
                const input = inputOf(
                  provider,
                  new FormData(event.currentTarget),
                );
                const problem = inputProblem(input);
                send(
                  problem === null
                    ? { _tag: 'Submitted', handle: holdKeys(input) }
                    : { _tag: 'Invalid', problem },
                );
              }}
            >
              <SheetHeader className="pr-12">
                <SheetTitle className="text-base">
                  {props.provider === null
                    ? 'Add a credential'
                    : `Add a ${label} credential`}
                </SheetTitle>
                <SheetDescription>
                  Console checks the keys with {label} before it saves them,
                  encrypted, and uses them only to deploy your projects.
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <FieldGroup>
                  {props.provider === null && (
                    <ProviderChoice
                      value={provider}
                      onChoose={(chosen) =>
                        send({ _tag: 'ProviderChosen', provider: chosen })
                      }
                    />
                  )}
                  <NameField provider={provider} problemAt={problemAt} />
                  {provider === 'cloudflare' ? (
                    <CloudflareFields
                      accountId={model.accountId}
                      onAccountId={(accountId) =>
                        send({ _tag: 'AccountIdTyped', accountId })
                      }
                      problemAt={problemAt}
                    />
                  ) : (
                    <AwsFields problemAt={problemAt} />
                  )}
                </FieldGroup>
              </div>
              <SheetFooter className="mt-0 border-t border-border">
                {model.problem !== null && model.problem.field === null && (
                  <p role="alert" className="text-sm text-destructive">
                    {model.problem.message}
                  </p>
                )}
                <Button type="submit" size="lg" disabled={model.busy}>
                  {model.busy && <Spinner aria-hidden />}
                  {model.busy ? `Checking with ${label}…` : 'Verify and add'}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    );
  },
);

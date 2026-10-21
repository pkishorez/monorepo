import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Action, Replicas } from '@kestack/std-toolkit/replica';
import { PocketRpc } from '../../../../apis/pocket/index.ts';
import {
  CreateWallet,
  DeleteEntry,
  Post,
  RenameWallet,
  Transfer,
} from '../../../../replicas/pocket/index.ts';
import { Entries, Wallets } from './queries.ts';

/*
 * Your Pocket: the active Account's wallets, the entries of the one picked,
 * and the forms that write them. The Account comes as Props from the page;
 * every write is an Action whose args name it, so a write asked before a
 * switch lands in the Account it was asked for, or fails.
 *
 * What it keeps is small: the wallet picked, for which Account, the writes
 * under way, and the last refusal, for the Account and form it came from.
 */

const Selected = Schema.Struct({
  account: Schema.String,
  wallet: Schema.String,
});

/** Which write a refusal belongs to, so it shows beside its form. */
const Form = Schema.Literals(['wallet', 'rename', 'post', 'transfer', 'entry']);

const Write = Schema.Struct({ id: Schema.String });

/** A form and the Account its write is for. */
const Asked = Schema.Struct({ form: Form, account: Schema.String });

const Model = Schema.Struct({
  selected: Schema.NullOr(Selected),
  refused: Schema.NullOr(
    Schema.Struct({ ...Asked.fields, reason: Schema.String }),
  ),
  /** The writes under way, one per form: an Action's end says which. */
  writing: Schema.Array(Asked),
});

type Model = typeof Model.Type;

export const PocketSection = Actor.define('Pocket', {
  requires: [Replicas, PocketRpc],
  props: Schema.Struct({ account: Schema.String }),
  model: Model,
  message: Schema.TaggedUnion({
    Select: { wallet: Schema.String },
    NewWallet: { ...Write.fields, name: Schema.String },
    Rename: { ...Write.fields, name: Schema.String },
    Move: {
      ...Write.fields,
      walletId: Schema.String,
      amount: Schema.Int,
      note: Schema.String,
    },
    Send: {
      ...Write.fields,
      from: Schema.String,
      to: Schema.String,
      amount: Schema.Int,
      note: Schema.String,
    },
    Remove: Write.fields,
    CreateWallet: Action.result,
    RenameWallet: Action.result,
    Post: Action.result,
    Transfer: Action.result,
    DeleteEntry: Action.result,
  }),
});

type Form = typeof Form.Type;

/** A write asked from `form` for `account`: that form's refusal goes. */
const asked = (model: Model, form: Form, account: string): Model => ({
  ...model,
  refused: model.refused?.form === form ? null : model.refused,
  writing: [
    ...model.writing.filter((each) => each.form !== form),
    { form, account },
  ],
});

/** The write from `form` ended: a refusal shows beside that form, for its Account. */
const ended = (model: Model, form: Form, failed: string | null): Model => {
  const write = model.writing.find((each) => each.form === form);
  return {
    ...model,
    writing: model.writing.filter((each) => each.form !== form),
    refused:
      failed === null || write === undefined
        ? model.refused
        : { ...write, reason: failed },
  };
};

export const PocketLive = Actor.build(PocketSection, {
  init: () => ({ model: { selected: null, refused: null, writing: [] } }),
  children: {
    wallets: {
      actor: Wallets,
      props: ({ props }) => ({ account: props.account }),
    },
    entries: {
      actor: Entries,
      while: ({ model, props }) => model.selected?.account === props.account,
      props: ({ model, props }) => ({
        account: props.account,
        wallet: model.selected?.wallet ?? '',
      }),
    },
  },
  on: {
    Select: ({ wallet }, { model, props }) => ({
      model: { ...model, selected: { account: props.account, wallet } },
    }),
    NewWallet: ({ id, name }, { model, props }) => ({
      model: {
        ...asked(model, 'wallet', props.account),
        selected: { account: props.account, wallet: id },
      },
      command: CreateWallet({ account: props.account, id, name }),
    }),
    Rename: ({ id, name }, { model, props }) => ({
      model: asked(model, 'rename', props.account),
      command: RenameWallet({ account: props.account, id, name }),
    }),
    Move: ({ _tag, ...input }, { model, props }) => ({
      model: asked(model, 'post', props.account),
      command: Post({ account: props.account, ...input }),
    }),
    Send: ({ _tag, ...input }, { model, props }) => ({
      model: asked(model, 'transfer', props.account),
      command: Transfer({ account: props.account, ...input }),
    }),
    Remove: ({ id }, { model, props }) => ({
      model: asked(model, 'entry', props.account),
      command: DeleteEntry({ account: props.account, id }),
    }),
    CreateWallet: ({ failed }, { model }) => ({
      model: ended(model, 'wallet', failed),
    }),
    RenameWallet: ({ failed }, { model }) => ({
      model: ended(model, 'rename', failed),
    }),
    Post: ({ failed }, { model }) => ({ model: ended(model, 'post', failed) }),
    Transfer: ({ failed }, { model }) => ({
      model: ended(model, 'transfer', failed),
    }),
    DeleteEntry: ({ failed }, { model }) => ({
      model: ended(model, 'entry', failed),
    }),
  },
});

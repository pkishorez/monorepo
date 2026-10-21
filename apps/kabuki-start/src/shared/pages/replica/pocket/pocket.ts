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
 * What it keeps is small: the wallet picked, for which Account, and the
 * last write's refusal, until the next write.
 */

const Selected = Schema.Struct({
  account: Schema.String,
  wallet: Schema.String,
});

/** Which write a refusal belongs to, so it shows beside its form. */
const Form = Schema.Literals(['wallet', 'rename', 'post', 'transfer', 'entry']);

const Write = Schema.Struct({ id: Schema.String });

const Model = Schema.Struct({
  selected: Schema.NullOr(Selected),
  refused: Schema.NullOr(Schema.Struct({ form: Form, reason: Schema.String })),
  /** The form the write under way came from. */
  writing: Schema.NullOr(Form),
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

/** A write asked from `form`: its refusal, if any, goes once the next starts. */
const asked = (model: Model, form: Model['writing']) => ({
  ...model,
  refused: null,
  writing: form,
});

/** A write ended: a refusal shows beside the form it came from. */
const ended = (model: Model, failed: string | null): Model => ({
  ...model,
  writing: null,
  refused:
    failed === null || model.writing === null
      ? null
      : { form: model.writing, reason: failed },
});

export const PocketLive = Actor.build(PocketSection, {
  init: () => ({ model: { selected: null, refused: null, writing: null } }),
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
        ...asked(model, 'wallet'),
        selected: { account: props.account, wallet: id },
      },
      command: CreateWallet({ account: props.account, id, name }),
    }),
    Rename: ({ id, name }, { model, props }) => ({
      model: asked(model, 'rename'),
      command: RenameWallet({ account: props.account, id, name }),
    }),
    Move: ({ _tag, ...input }, { model, props }) => ({
      model: asked(model, 'post'),
      command: Post({ account: props.account, ...input }),
    }),
    Send: ({ _tag, ...input }, { model, props }) => ({
      model: asked(model, 'transfer'),
      command: Transfer({ account: props.account, ...input }),
    }),
    Remove: ({ id }, { model, props }) => ({
      model: asked(model, 'entry'),
      command: DeleteEntry({ account: props.account, id }),
    }),
    CreateWallet: ({ failed }, { model }) => ({ model: ended(model, failed) }),
    RenameWallet: ({ failed }, { model }) => ({ model: ended(model, failed) }),
    Post: ({ failed }, { model }) => ({ model: ended(model, failed) }),
    Transfer: ({ failed }, { model }) => ({ model: ended(model, failed) }),
    DeleteEntry: ({ failed }, { model }) => ({ model: ended(model, failed) }),
  },
});
